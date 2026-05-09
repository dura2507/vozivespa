import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { findFreeUnit, describeConflict } from "@/lib/availability";
import { sendCustomerBookingDecidedEmail } from "@/lib/email";
import {
  editTelegramMessageForBooking,
  sendOwnerCancellationTelegram,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["confirmed", "declined", "cancelled"] as const;
type Decision = (typeof ALLOWED)[number];

// POST /api/admin/bookings/[id]/status — { status }
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

  let assignedUnitId: string | null = booking.bike_unit_id;
  if (decision === "confirmed") {
    try {
      const availability = await findFreeUnit(supabase, {
        bikeId: booking.bike_id,
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        pickupTime: booking.pickup_time,
        returnTime: booking.return_time,
        excludeBookingId: booking.id,
      });
      if (!availability.unitId) {
        return NextResponse.json(
          {
            error: "Time conflict — can't confirm",
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
      // their dates are released using the declined template.
      if (decision === "cancelled" && wasConfirmed) {
        await sendCustomerBookingDecidedEmail(updated, "declined");
        await sendOwnerCancellationTelegram(updated);
      }
      // Try to keep any existing Telegram booking message in sync if
      // one's still around (best-effort: this requires the original
      // message_id which we don't track yet, so skip silently).
      void editTelegramMessageForBooking;
    } catch (err) {
      console.error("[/api/admin/bookings/status] notify", err);
    }
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
