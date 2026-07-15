import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import {
  sendCustomerBookingDecidedEmail,
  sendOwnerCancellationEmail,
} from "@/lib/email";
import { sendOwnerCancellationTelegram } from "@/lib/telegram";
import { findFreeUnit, findUnitConflict, describeConflict } from "@/lib/availability";

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
    if (booking.picked_up_at) {
      return NextResponse.json(
        { error: "This rental is already picked up. Please contact us on WhatsApp." },
        { status: 409 },
      );
    }
    const { data: updated, error: upErr } = await supabase
      .from("bookings")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
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
      await Promise.allSettled([
        sendOwnerCancellationTelegram(updated),
        sendOwnerCancellationEmail(updated, "customer"),
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
