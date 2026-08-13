import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendCustomerBookingDecidedEmail, sendCustomerGroupBookingDecidedEmail } from "@/lib/email";
import {
  answerTelegramCallback,
  editTelegramMessageForBooking,
  editTelegramMessageForGroup,
  parseCallbackData,
  NEW_STATUS,
} from "@/lib/telegram";
import {
  findFreeUnits,
  findUnitConflict,
  findUnitForOwnerAction,
  reserveUnitIds,
  wholeModelBlockConflict,
  getBikeUnitLabel,
  describeConflict,
} from "@/lib/availability";

export const dynamic = "force-dynamic";

// Telegram webhook entry point.
//
// Verified via the X-Telegram-Bot-Api-Secret-Token header - set when calling
// /setWebhook with a secret_token parameter. Telegram echoes that back on
// every request, anyone else gets 403.

type CallbackQuery = {
  id: string;
  data?: string;
  message?: {
    chat: { id: number };
    message_id: number;
  };
};

type Update = {
  callback_query?: CallbackQuery;
};

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (expected && provided !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cb = update.callback_query;
  if (!cb || !cb.message) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseCallbackData(cb.data);
  if (!parsed) {
    await answerTelegramCallback(cb.id, "Unknown action");
    return NextResponse.json({ ok: true });
  }

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("secret_token", parsed.secretToken)
    .maybeSingle<BookingRow>();

  if (error) {
    console.error("[telegram/webhook] booking lookup error", error);
    await answerTelegramCallback(cb.id, "Database error - try again");
    return NextResponse.json({ ok: true });
  }

  if (!booking) {
    await answerTelegramCallback(cb.id, "Booking not found");
    return NextResponse.json({ ok: true });
  }

  // Multi-bike group booking: the consolidated message's buttons carry
  // the primary row's token, but Confirm/Decline must apply to EVERY row
  // in the group. Handled here, fully separate from the single-booking
  // path below so that flow is untouched.
  if (booking.booking_group_id) {
    const { data: groupData, error: groupErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_group_id", booking.booking_group_id)
      .order("created_at", { ascending: true });
    if (groupErr || !groupData || groupData.length === 0) {
      await answerTelegramCallback(cb.id, "Database error - try again");
      return NextResponse.json({ ok: true });
    }
    const rows = groupData as BookingRow[];
    const groupStatus = NEW_STATUS[parsed.action];

    // Judge state from the TAPPED row (booking), not rows[0]: created_at
    // ascending is nondeterministic within one insert batch.
    if (booking.status === groupStatus) {
      await answerTelegramCallback(cb.id, `Already ${groupStatus}`);
      // Best-effort: an identical re-render throws "message is not modified",
      // which must not turn the webhook into a 500 (Telegram would retry-loop).
      await editTelegramMessageForGroup(cb.message.chat.id, cb.message.message_id, rows).catch(
        () => {},
      );
      return NextResponse.json({ ok: true });
    }

    const wasPending = booking.status === "pending";

    // On confirm, re-validate every assigned unit is still free for the
    // window (another booking could have taken one while this group sat
    // pending). Any conflict aborts the whole group — owner sorts it out.
    if (groupStatus === "confirmed") {
      // Capacity re-check per bike model, excluding THIS group's own rows
      // (they all share one window). Counts unassigned bookings + blocks, so
      // a new booking that took a slot while this group sat pending is caught.
      const win = {
        dateFrom: rows[0].date_from,
        dateTo: rows[0].date_to,
        pickupTime: rows[0].pickup_time,
        returnTime: rows[0].return_time,
      };
      // Only rows that will actually be (re-)confirmed demand capacity. The
      // update below filters `.neq('status','cancelled')`, so counting an
      // individually-cancelled sibling here would require a phantom extra unit
      // and could wrongly reject the whole group. Match the update's filter.
      const activeRows = rows.filter((r) => r.status !== "cancelled");
      // Capacity is the REGULAR fleet only, exactly like the public site and
      // like the single confirm below. A row already parked on the Ghost Bike
      // rides a separate vehicle: it demands no regular bike, and the reserve
      // never counts as extra capacity for the others.
      let reserveIds: Set<string>;
      try {
        reserveIds = await reserveUnitIds(supabase, activeRows.map((r) => r.bike_id));
      } catch (err) {
        console.error("[telegram/webhook] reserve lookup error", err);
        await answerTelegramCallback(cb.id, "Database error - try again");
        return NextResponse.json({ ok: true });
      }
      const qtyByBike = new Map<string, number>();
      for (const r of activeRows) {
        // Already returned: bike is free again, demands nothing (and the
        // engine excludes it from supply too, so counting it would reject a
        // legitimate re-confirm of a partially returned group).
        if (r.returned_at != null) continue;
        // On the Ghost Bike: separate vehicle, but only when the reserve is
        // genuinely still free for this window.
        if (r.bike_unit_id && reserveIds.has(r.bike_unit_id)) {
          const clash = await findUnitConflict(supabase, {
            bikeUnitId: r.bike_unit_id,
            ...win,
            excludeBookingId: r.id,
          });
          // A whole-model block (season pause) covers the reserve too, so a
          // ghost-parked row is NOT free during one.
          const reserveUnavailable = clash
            ? true
            : (await wholeModelBlockConflict(supabase, { bikeId: r.bike_id, ...win })) != null;
          // Reserve genuinely free -> this row needs no regular bike.
          if (!reserveUnavailable) continue;
          // Otherwise it falls through and demands one like any other row.
        }
        qtyByBike.set(r.bike_id, (qtyByBike.get(r.bike_id) ?? 0) + 1);
      }
      const groupId = booking.booking_group_id ?? undefined;
      for (const [bikeId, qty] of qtyByBike) {
        try {
          const free = await findFreeUnits(supabase, { bikeId, ...win, excludeGroupId: groupId }, qty);
          if (free.totalFree < qty) {
            await answerTelegramCallback(cb.id, "Conflict - not enough bikes free for these dates");
            return NextResponse.json({ ok: true });
          }
        } catch (err) {
          console.error("[telegram/webhook] group availability error", err);
          await answerTelegramCallback(cb.id, "Database error - try again");
          return NextResponse.json({ ok: true });
        }
      }
    }

    const nowIso = new Date().toISOString();
    // Never revive a row that was individually cancelled (e.g. a customer
    // used their cancel link): a group confirm/decline must leave it alone.
    const { error: groupUpdErr } = await supabase
      .from("bookings")
      .update({ status: groupStatus, decided_at: nowIso })
      .eq("booking_group_id", booking.booking_group_id)
      .neq("status", "cancelled");
    if (groupUpdErr) {
      console.error("[telegram/webhook] group update error", groupUpdErr);
      await answerTelegramCallback(cb.id, "Update failed - try again");
      return NextResponse.json({ ok: true });
    }

    await answerTelegramCallback(
      cb.id,
      groupStatus === "confirmed"
        ? wasPending
          ? "✓ Group confirmed"
          : "✓ Re-confirmed - dates blocked again"
        : wasPending
          ? "✗ Group declined"
          : "✗ Declined - dates released",
    );

    const updatedRows = rows.map((r) =>
      r.status === "cancelled" ? r : { ...r, status: groupStatus, decided_at: nowIso },
    );
    after(async () => {
      const edits = new Map<string, { chatId: string | number; messageId: number }>();
      edits.set(`${cb.message!.chat.id}:${cb.message!.message_id}`, {
        chatId: cb.message!.chat.id,
        messageId: cb.message!.message_id,
      });
      for (const ref of updatedRows[0].telegram_message_refs ?? []) {
        if (ref?.messageId) edits.set(`${ref.chatId}:${ref.messageId}`, ref);
      }
      await Promise.allSettled(
        [...edits.values()].map((e) => editTelegramMessageForGroup(e.chatId, e.messageId, updatedRows)),
      );
      if (wasPending) {
        await sendCustomerGroupBookingDecidedEmail(updatedRows, groupStatus);
      }
    });

    return NextResponse.json({ ok: true });
  }

  const newStatus = NEW_STATUS[parsed.action];

  if (booking.status === newStatus) {
    await answerTelegramCallback(cb.id, `Already ${newStatus}`);
    // Make sure the keyboard reflects current state in case it drifted.
    const staleLabel = await getBikeUnitLabel(supabase, booking.bike_unit_id).catch(() => null);
    await editTelegramMessageForBooking(cb.message.chat.id, cb.message.message_id, booking, staleLabel).catch(
      () => {},
    );
    return NextResponse.json({ ok: true });
  }

  const wasFromPending = booking.status === "pending";

  // Re-check availability before flipping to confirmed. A second
  // pending booking could have been created while this one was awaiting
  // approval, or the owner might have added a manual block in Supabase
  // Studio. With multi-unit, this also locks in the actual free unit
  // at confirm-time . the unit assigned at insert may have been taken
  // by another customer in the meantime.
  let assignedUnitId: string | null = booking.bike_unit_id;
  if (newStatus === "confirmed") {
    try {
      // Regular fleet only, exactly like the public site. A booking already
      // parked on the Ghost Bike keeps that parking (checked against the
      // reserve itself), so a tap still works when every regular bike is out.
      const availability = await findUnitForOwnerAction(
        supabase,
        {
          bikeId: booking.bike_id,
          dateFrom: booking.date_from,
          dateTo: booking.date_to,
          pickupTime: booking.pickup_time,
          returnTime: booking.return_time,
          excludeBookingId: booking.id,
        },
        booking.bike_unit_id,
      );
      // Capacity model: reject ONLY when the window is genuinely over
      // capacity (conflict set). A null unitId with no conflict means the
      // window fits but no single unit spans it end to end - confirm it
      // UNPINNED (bike_unit_id = null) and it gets a physical bike at
      // pickup, exactly like every other surface. The old `!unitId` gate
      // here wrongly rejected those, so tapping Confirm aborted and the
      // message stayed stuck on "pending" for everyone in the group.
      if (availability.conflict) {
        await answerTelegramCallback(
          cb.id,
          `Conflict - ${describeConflict(availability.conflict)}`,
        );
        return NextResponse.json({ ok: true });
      }
      assignedUnitId = availability.unitId;
    } catch (err) {
      console.error("[telegram/webhook] availability check error", err);
      await answerTelegramCallback(cb.id, "Database error - try again");
      return NextResponse.json({ ok: true });
    }
  }

  const patch: Partial<BookingRow> = {
    status: newStatus,
    decided_at: new Date().toISOString(),
  };
  if (newStatus === "confirmed") patch.bike_unit_id = assignedUnitId;

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", booking.id)
    .select("*")
    .maybeSingle<BookingRow>();

  if (updateError || !updated) {
    console.error("[telegram/webhook] update error", updateError);
    await answerTelegramCallback(cb.id, "Update failed - try again");
    return NextResponse.json({ ok: true });
  }

  // Toast immediately so Telegram stops spinning on the user's button.
  const toast =
    newStatus === "confirmed"
      ? wasFromPending
        ? "✓ Booking confirmed"
        : "✓ Re-confirmed - dates blocked again"
      : wasFromPending
        ? "✗ Booking declined"
        : "✗ Declined - dates released";
  await answerTelegramCallback(cb.id, toast);

  // Heavy work after the response - Vercel keeps the function alive for these.
  after(async () => {
    // Sync EVERY copy of this booking's message (group topic + any other
    // chats it was posted to), not just the one that was tapped — so the
    // confirmed/declined state is consistent everywhere. Always include
    // the tapped message in case the stored refs are missing/stale.
    const edits = new Map<string, { chatId: string | number; messageId: number }>();
    edits.set(`${cb.message!.chat.id}:${cb.message!.message_id}`, {
      chatId: cb.message!.chat.id,
      messageId: cb.message!.message_id,
    });
    for (const ref of updated.telegram_message_refs ?? []) {
      if (ref?.messageId) edits.set(`${ref.chatId}:${ref.messageId}`, ref);
    }
    const unitLabel = await getBikeUnitLabel(supabase, updated.bike_unit_id).catch(
      () => null,
    );
    await Promise.allSettled(
      [...edits.values()].map((e) =>
        editTelegramMessageForBooking(e.chatId, e.messageId, updated, unitLabel),
      ),
    );
    if (wasFromPending) {
      await sendCustomerBookingDecidedEmail(updated, newStatus);
    }
  });

  return NextResponse.json({ ok: true });
}
