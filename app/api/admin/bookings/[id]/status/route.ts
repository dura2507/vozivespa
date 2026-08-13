import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import {
  findFreeUnits,
  findUnitConflict,
  findUnitForOwnerAction,
  reserveUnitIds,
  wholeModelBlockConflict,
  getBikeUnitLabel,
  describeConflict,
} from "@/lib/availability";
import {
  sendCustomerBookingDecidedEmail,
  sendCustomerGroupBookingDecidedEmail,
  sendOwnerCancellationEmail,
} from "@/lib/email";
import {
  editTelegramMessageForBooking,
  editTelegramMessageForGroup,
  sendOwnerCancellationTelegram,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["confirmed", "declined", "cancelled"] as const;
type Decision = (typeof ALLOWED)[number];

// POST /api/admin/bookings/[id]/status . { status }
//
// Owner-side status flip with the same overlap re-check as the public
// confirm paths so the admin can't accidentally double-book.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (!(ALLOWED as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const decision = status as Decision;

  const supabase = getServiceClient();
  const { data: booking, error: lookupErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (lookupErr) {
    console.error("[/api/admin/bookings/status] lookup", lookupErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === decision) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Group booking: apply the decision to the WHOLE group, not just this row,
  // otherwise the other bikes keep the old status and the calendar disagrees
  // with the customer's booking. The consolidated Telegram card + group email
  // cover the whole group.
  if (booking.booking_group_id) {
    const { data: groupData, error: gErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_group_id", booking.booking_group_id);
    if (gErr || !groupData || groupData.length === 0) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const groupRows = groupData as BookingRow[];
    const active = groupRows.filter((r) => r.status !== "cancelled");

    // Whole group already cancelled: the update below filters
    // `.neq('status','cancelled')`, so it would touch 0 rows yet still report
    // {ok:true} as if the decision applied. Report "nothing changed" honestly
    // instead of a silent no-op that the UI reads as a successful confirm.
    if (active.length === 0) {
      return NextResponse.json({ ok: true, unchanged: true, status: "cancelled" });
    }

    if (decision === "confirmed") {
      const win = {
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        pickupTime: booking.pickup_time,
        returnTime: booking.return_time,
      };
      // Capacity is the REGULAR fleet only. A row already parked on the Ghost
      // Bike rides a separate vehicle, so it neither demands a regular bike
      // nor lets the reserve count as extra capacity for its siblings.
      let reserveIds: Set<string>;
      try {
        reserveIds = await reserveUnitIds(supabase, active.map((r) => r.bike_id));
      } catch (err) {
        console.error("[/api/admin/bookings/status] reserve lookup", err);
        return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
      }
      const qtyByBike = new Map<string, number>();
      for (const r of active) {
        // Already back: the bike is free again, so this row demands nothing.
        // findFreeUnits excludes returned rows from supply too, so counting
        // them here would inflate demand and reject a legitimate re-confirm.
        if (r.returned_at != null) continue;
        // Parked on the Ghost Bike: separate vehicle, no regular bike needed -
        // but only if the reserve is genuinely still free for this window.
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
          // Reserve taken meanwhile: this row needs a regular bike after all.
        }
        qtyByBike.set(r.bike_id, (qtyByBike.get(r.bike_id) ?? 0) + 1);
      }
      for (const [bId, qty] of qtyByBike) {
        try {
          const free = await findFreeUnits(
            supabase,
            { bikeId: bId, ...win, excludeGroupId: booking.booking_group_id },
            qty,
          );
          if (free.totalFree < qty) {
            return NextResponse.json(
              { error: `Time conflict, can't confirm the whole group (${bId}).` },
              { status: 409 },
            );
          }
        } catch (err) {
          console.error("[/api/admin/bookings/status] group availability", err);
          return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
        }
      }
    }

    const wasPendingGroup = booking.status === "pending";
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("bookings")
      .update({ status: decision, decided_at: nowIso })
      .eq("booking_group_id", booking.booking_group_id)
      .neq("status", "cancelled");
    if (upErr) {
      console.error("[/api/admin/bookings/status] group update", upErr);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    const updatedRows = groupRows.map((r) =>
      r.status === "cancelled" ? r : { ...r, status: decision, decided_at: nowIso },
    );

    after(async () => {
      try {
        if (wasPendingGroup && (decision === "confirmed" || decision === "declined")) {
          await sendCustomerGroupBookingDecidedEmail(updatedRows, decision);
        }
        if (decision === "cancelled") {
          await sendOwnerCancellationTelegram(booking);
        }
        const refs = (updatedRows[0].telegram_message_refs ?? []) as Array<{
          chatId: string;
          messageId: number;
        }>;
        if (refs.length > 0) {
          await Promise.allSettled(
            refs.map((r) => editTelegramMessageForGroup(r.chatId, r.messageId, updatedRows)),
          );
        }
      } catch (err) {
        console.error("[/api/admin/bookings/status] group notify", err);
      }
    });
    return NextResponse.json({ ok: true, status: decision, group: true });
  }

  let assignedUnitId: string | null = booking.bike_unit_id;
  if (decision === "confirmed") {
    try {
      // Regular fleet only, same as the public site. A booking already parked
      // on the Ghost Bike keeps that parking (validated against the reserve
      // itself), so confirming it works even when all regular bikes are out.
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
      if (availability.conflict) {
        return NextResponse.json(
          {
            error: "Time conflict . can't confirm",
            detail: availability.conflict
              ? describeConflict(availability.conflict)
              : "no free unit",
          },
          { status: 409 },
        );
      }
      assignedUnitId = availability.unitId;
    } catch (err) {
      console.error("[/api/admin/bookings/status] availability", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  const wasFromPending = booking.status === "pending";
  const wasConfirmed = booking.status === "confirmed";

  const update: Partial<BookingRow> = {
    status: decision,
    decided_at: new Date().toISOString(),
  };
  if (decision === "confirmed") update.bike_unit_id = assignedUnitId;

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle<BookingRow>();
  if (updateErr || !updated) {
    console.error("[/api/admin/bookings/status] update", updateErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Notify after the response so the dashboard refreshes fast.
  after(async () => {
    try {
      // Confirm + decline trigger the standard customer email,
      // but only on the first move out of pending (matches the
      // existing Telegram + email-link confirm behaviour).
      if (wasFromPending && (decision === "confirmed" || decision === "declined")) {
        await sendCustomerBookingDecidedEmail(updated, decision);
      }
      // Owner-side cancel of a confirmed booking: tell the customer
      // their dates are released using the declined template, and
      // record an owner notification on both channels for the inbox.
      if (decision === "cancelled" && wasConfirmed) {
        await sendCustomerBookingDecidedEmail(updated, "declined");
        await sendOwnerCancellationTelegram(updated);
        await sendOwnerCancellationEmail(updated, "owner");
      }
      // Keep the original Telegram booking messages in sync with the
      // new status. We stored each {chatId, messageId} when the
      // booking was forwarded, so we can call editMessageText for
      // every chat the bot posted to (owner + partner today). Each
      // edit is independent — if one chat has deleted the message
      // we still want the others to update.
      const refs = (updated.telegram_message_refs ?? []) as Array<{
        chatId: string;
        messageId: number;
      }>;
      if (refs.length > 0) {
        const unitLabel = await getBikeUnitLabel(supabase, updated.bike_unit_id).catch(
          () => null,
        );
        await Promise.allSettled(
          refs.map((r) =>
            editTelegramMessageForBooking(r.chatId, r.messageId, updated, unitLabel),
          ),
        );
      }
    } catch (err) {
      console.error("[/api/admin/bookings/status] notify", err);
    }
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
