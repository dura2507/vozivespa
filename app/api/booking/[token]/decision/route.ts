import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import {
  sendCustomerBookingDecidedEmail,
  sendOwnerCancellationEmail,
} from "@/lib/email";
import {
  editTelegramMessageForBooking,
  editTelegramMessageForGroup,
  sendOwnerCancellationTelegram,
} from "@/lib/telegram";
import { findFreeUnit, findUnitConflict, describeConflict, getBikeUnitLabel } from "@/lib/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/booking/[token]/decision  { action: "confirm" | "decline" | "cancel" }
//
// The actual state change behind the confirm / decline / cancel links. The
// pages themselves only READ and render a confirmation button; nothing
// mutates on a GET anymore. This matters most for the cancel link, which
// sits in every customer email: link-preview bots and mail scanners fire GETs
// automatically, and a GET-mutating cancel page let them silently cancel
// confirmed bookings. Every update is status-guarded so a double tap or a
// race can't flip an already-decided booking.
const ACTIONS = ["confirm", "decline", "cancel"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("secret_token", token)
    .maybeSingle<BookingRow>();
  if (error) {
    console.error("[booking/decision] lookup", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "This link is invalid or expired." }, { status: 404 });
  }

  const act = action as Action;

  // ---- Cancel (customer): pending or confirmed, but never an already
  //      picked-up rental (the bike is physically out - cancelling would
  //      free capacity that isn't actually free).
  //
  //      GROUP orders: the customer made ONE order; their cancel link drops
  //      the WHOLE group, not a single bike. One-row cancels created
  //      mixed-status groups (phantom demand: siblings stayed confirmed for a
  //      customer who isn't coming) - the same split-state family of bugs as
  //      the group edit. Mirrors the admin status route's group semantics.
  if (act === "cancel") {
    if (booking.status === "cancelled") {
      return NextResponse.json({ ok: true, status: "cancelled", already: true });
    }
    if (booking.status === "declined") {
      return NextResponse.json(
        { error: "This booking was already declined, nothing to cancel." },
        { status: 409 },
      );
    }

    const groupId = booking.booking_group_id;
    let groupRows: BookingRow[] | null = null;
    if (groupId) {
      const { data: gData, error: gErr } = await supabase
        .from("bookings")
        .select("*")
        .eq("booking_group_id", groupId);
      if (gErr) {
        console.error("[booking/decision] group lookup", gErr);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
      groupRows = (gData ?? []) as BookingRow[];
    }
    // Rows this cancel would actually flip. If ANY of them is already picked
    // up, the whole order is un-cancellable here (a bike is physically out).
    const cancellable = groupRows
      ? groupRows.filter((r) => r.status === "pending" || r.status === "confirmed")
      : [booking];
    if (cancellable.some((r) => r.picked_up_at)) {
      return NextResponse.json(
        { error: "This rental is already picked up. Please contact us on WhatsApp." },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();

    if (groupId && groupRows) {
      const { data: updatedData, error: upErr } = await supabase
        .from("bookings")
        .update({ status: "cancelled", decided_at: nowIso })
        .eq("booking_group_id", groupId)
        .in("status", ["pending", "confirmed"])
        .select("*");
      if (upErr) {
        console.error("[booking/decision] group cancel", upErr);
        return NextResponse.json({ error: "Could not cancel this booking." }, { status: 500 });
      }
      const updatedNow = (updatedData ?? []) as BookingRow[];
      if (updatedNow.length === 0) {
        // Status changed under us (race) - report current truth.
        return NextResponse.json({ ok: true, status: "cancelled", already: true });
      }
      const updatedPrimary = updatedNow.find((r) => r.id === booking.id) ?? updatedNow[0];
      // Full group view for the Telegram card: overlay the fresh statuses on
      // the rows we fetched (rows already cancelled/declined stay as they are).
      const updatedIds = new Set(updatedNow.map((r) => r.id));
      const cardRows = groupRows.map((r) =>
        updatedIds.has(r.id) ? ({ ...r, status: "cancelled", decided_at: nowIso } as BookingRow) : r,
      );
      // Group creation writes telegram_message_refs to every row; take the
      // first row that has them.
      const refs = (groupRows.find((r) => (r.telegram_message_refs ?? []).length > 0)
        ?.telegram_message_refs ?? []) as Array<{ chatId: string; messageId: number }>;
      after(async () => {
        await Promise.allSettled([
          sendOwnerCancellationTelegram(updatedPrimary),
          sendOwnerCancellationEmail(updatedPrimary, "customer"),
          ...refs.map((r) => editTelegramMessageForGroup(r.chatId, r.messageId, cardRows)),
        ]);
      });
      return NextResponse.json({ ok: true, status: "cancelled", group: true, bikes: updatedNow.length });
    }

    const { data: updated, error: upErr } = await supabase
      .from("bookings")
      .update({ status: "cancelled", decided_at: nowIso })
      .eq("id", booking.id)
      .in("status", ["pending", "confirmed"])
      .select("*")
      .maybeSingle<BookingRow>();
    if (upErr) {
      console.error("[booking/decision] cancel", upErr);
      return NextResponse.json({ error: "Could not cancel this booking." }, { status: 500 });
    }
    if (!updated) {
      // Status changed under us (race) - report current truth.
      return NextResponse.json({ ok: true, status: "cancelled", already: true });
    }
    after(async () => {
      // Keep the original owner Telegram card in sync (it used to stay
      // "confirmed" forever after a customer self-cancel).
      const refs = (updated.telegram_message_refs ?? []) as Array<{
        chatId: string;
        messageId: number;
      }>;
      const unitLabel =
        refs.length > 0
          ? await getBikeUnitLabel(supabase, updated.bike_unit_id).catch(() => null)
          : null;
      await Promise.allSettled([
        sendOwnerCancellationTelegram(updated),
        sendOwnerCancellationEmail(updated, "customer"),
        ...refs.map((r) => editTelegramMessageForBooking(r.chatId, r.messageId, updated, unitLabel)),
      ]);
    });
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  // ---- Confirm / Decline (owner): only from pending.
  if (booking.status === (act === "confirm" ? "confirmed" : "declined")) {
    return NextResponse.json({ ok: true, status: booking.status, already: true });
  }
  if (booking.status !== "pending") {
    return NextResponse.json(
      { error: `This booking can no longer be ${act}ed, it is '${booking.status}'.` },
      { status: 409 },
    );
  }

  if (act === "decline") {
    const { data: updated, error: upErr } = await supabase
      .from("bookings")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle<BookingRow>();
    if (upErr) {
      console.error("[booking/decision] decline", upErr);
      return NextResponse.json({ error: "Could not update the booking." }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ ok: true, status: "declined", already: true });
    after(async () => {
      await sendCustomerBookingDecidedEmail(updated, "declined");
    });
    return NextResponse.json({ ok: true, status: "declined" });
  }

  // confirm: re-check capacity (include the reserve, same as the Telegram
  // and admin confirm surfaces) and keep a ghost pin instead of moving the
  // booking back onto a regular unit.
  let assignedUnitId: string | null = booking.bike_unit_id;
  try {
    const availability = await findFreeUnit(
      supabase,
      {
        bikeId: booking.bike_id,
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        pickupTime: booking.pickup_time,
        returnTime: booking.return_time,
        excludeBookingId: booking.id,
      },
      { includeBackup: true },
    );
    if (availability.conflict) {
      return NextResponse.json(
        { error: `Cannot confirm. ${describeConflict(availability.conflict)}` },
        { status: 409 },
      );
    }
    assignedUnitId = availability.unitId;
    if (booking.bike_unit_id) {
      const { data: currentUnit } = await supabase
        .from("bike_units")
        .select("id, is_backup")
        .eq("id", booking.bike_unit_id)
        .maybeSingle<{ id: string; is_backup: boolean }>();
      if (currentUnit?.is_backup) {
        const clash = await findUnitConflict(supabase, {
          bikeUnitId: booking.bike_unit_id,
          dateFrom: booking.date_from,
          dateTo: booking.date_to,
          pickupTime: booking.pickup_time,
          returnTime: booking.return_time,
          excludeBookingId: booking.id,
        });
        if (!clash) assignedUnitId = booking.bike_unit_id;
      }
    }
  } catch (err) {
    console.error("[booking/decision] confirm availability", err);
    return NextResponse.json({ error: "Could not verify availability." }, { status: 500 });
  }

  const { data: updated, error: upErr } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      decided_at: new Date().toISOString(),
      bike_unit_id: assignedUnitId,
    })
    .eq("id", booking.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle<BookingRow>();
  if (upErr) {
    console.error("[booking/decision] confirm", upErr);
    return NextResponse.json({ error: "Could not update the booking." }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ ok: true, status: "confirmed", already: true });
  after(async () => {
    await sendCustomerBookingDecidedEmail(updated, "confirmed");
  });
  return NextResponse.json({ ok: true, status: "confirmed" });
}
