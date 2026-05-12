import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { findFreeUnit, describeConflict } from "@/lib/availability";
import { isValidSlot, parseTime } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = ["paypal_ff", "paypal_company", "bank"] as const;
const LICENCES = ["A", "A1", "A2", "AM", "B"] as const;
const RIDING_STYLES = ["solo", "with_passenger"] as const;

// PATCH /api/admin/bookings/[id]
//
// Generic owner-side edit. Window fields (dateFrom/dateTo + times) go
// through the same overlap check as the create flow so the admin can't
// shift a booking into someone else's slot. Customer + detail fields
// (name, phone, email, notes, price, licence, riding style, payment
// method, licence country) update freely so owner can fill in walk-in
// info later.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    dateFrom?: unknown;
    dateTo?: unknown;
    pickupTime?: unknown;
    returnTime?: unknown;
    customerName?: unknown;
    customerPhone?: unknown;
    customerEmail?: unknown;
    notes?: unknown;
    totalPriceEuros?: unknown;
    paymentMethod?: unknown;
    driversLicence?: unknown;
    ridingStyle?: unknown;
    licenceCountry?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dateFrom = typeof body.dateFrom === "string" && ISO_DATE.test(body.dateFrom) ? body.dateFrom : null;
  const dateTo = typeof body.dateTo === "string" && ISO_DATE.test(body.dateTo) ? body.dateTo : null;
  const pickupTime = typeof body.pickupTime === "string" && isValidSlot(body.pickupTime) ? body.pickupTime : null;
  const returnTime = typeof body.returnTime === "string" && isValidSlot(body.returnTime) ? body.returnTime : null;

  if (!dateFrom || !dateTo || !pickupTime || !returnTime) {
    return NextResponse.json(
      { error: "All four window fields are required and must be valid" },
      { status: 400 },
    );
  }
  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: "Pickup date must be on or before return date" },
      { status: 400 },
    );
  }
  if (dateFrom === dateTo && parseTime(pickupTime)! >= parseTime(returnTime)!) {
    return NextResponse.json(
      { error: "Same-day return must be later than pickup" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const { data: booking, error: lookupErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (lookupErr) {
    console.error("[/api/admin/bookings] lookup", lookupErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  let assignedUnitId: string | null = booking.bike_unit_id;
  try {
    const availability = await findFreeUnit(supabase, {
      bikeId: booking.bike_id,
      dateFrom,
      dateTo,
      pickupTime,
      returnTime,
      excludeBookingId: booking.id,
    });
    if (!availability.unitId) {
      return NextResponse.json(
        {
          error: "Time conflict",
          detail: availability.conflict
            ? describeConflict(availability.conflict)
            : "no free unit",
        },
        { status: 409 },
      );
    }
    // For confirmed bookings, lock in the new unit choice. For pending
    // bookings we still update so the auto-assigned unit reflects the
    // edited window.
    assignedUnitId = availability.unitId;
  } catch (err) {
    console.error("[/api/admin/bookings] availability", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // ---------- Optional customer + detail fields ----------
  // Each follows the same pattern: only updates when present + valid;
  // empty string is interpreted as "clear this field" so owner can
  // remove a wrong note / email; undefined leaves the column alone.

  const updateRow: Partial<BookingRow> = {
    date_from: dateFrom,
    date_to: dateTo,
    pickup_time: pickupTime,
    return_time: returnTime,
    bike_unit_id: assignedUnitId,
  };

  if (typeof body.customerName === "string") {
    const v = body.customerName.trim();
    if (v.length === 0) {
      return NextResponse.json({ error: "Customer name can't be empty" }, { status: 400 });
    }
    updateRow.customer_name = v;
  }
  if (typeof body.customerPhone === "string") {
    updateRow.customer_phone = body.customerPhone.trim();
  }
  if (typeof body.customerEmail === "string") {
    updateRow.customer_email = body.customerEmail.trim();
  }

  // licenceCountry + notes share a column. If either is sent, we
  // rebuild the notes string from scratch so the prefix stays
  // canonical. licenceCountry empty string = remove the prefix.
  const licenceCountryProvided = typeof body.licenceCountry === "string";
  const notesProvided = typeof body.notes === "string";
  if (licenceCountryProvided || notesProvided) {
    const lc = licenceCountryProvided
      ? (body.licenceCountry as string).trim()
      : extractLicenceCountry(booking.notes);
    const rawNotes = notesProvided
      ? (body.notes as string).trim()
      : stripLicenceCountry(booking.notes);
    updateRow.notes = lc
      ? `Licence country: ${lc}${rawNotes ? `\n\n${rawNotes}` : ""}`
      : rawNotes || null;
  }

  if (typeof body.totalPriceEuros !== "undefined") {
    const v = body.totalPriceEuros;
    if (v === null || v === "") {
      updateRow.total_price_cents = null;
    } else {
      const n =
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? parseFloat(v.replace(",", "."))
            : NaN;
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "Price must be a number ≥ 0" }, { status: 400 });
      }
      updateRow.total_price_cents = Math.round(n * 100);
    }
  }

  if (typeof body.paymentMethod === "string" || body.paymentMethod === null) {
    if (body.paymentMethod === null || body.paymentMethod === "") {
      updateRow.payment_method = null;
    } else if ((PAYMENT_METHODS as readonly string[]).includes(body.paymentMethod as string)) {
      updateRow.payment_method = body.paymentMethod as (typeof PAYMENT_METHODS)[number];
    } else {
      return NextResponse.json({ error: "Unknown payment method" }, { status: 400 });
    }
  }

  if (typeof body.driversLicence === "string" || body.driversLicence === null) {
    if (body.driversLicence === null || body.driversLicence === "") {
      updateRow.drivers_licence = null;
    } else if ((LICENCES as readonly string[]).includes(body.driversLicence as string)) {
      updateRow.drivers_licence = body.driversLicence as (typeof LICENCES)[number];
    } else {
      return NextResponse.json({ error: "Unknown licence category" }, { status: 400 });
    }
  }

  if (typeof body.ridingStyle === "string" || body.ridingStyle === null) {
    if (body.ridingStyle === null || body.ridingStyle === "") {
      updateRow.riding_style = null;
    } else if ((RIDING_STYLES as readonly string[]).includes(body.ridingStyle as string)) {
      updateRow.riding_style = body.ridingStyle as (typeof RIDING_STYLES)[number];
    } else {
      return NextResponse.json({ error: "Unknown riding style" }, { status: 400 });
    }
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update(updateRow)
    .eq("id", id);
  if (updateErr) {
    console.error("[/api/admin/bookings] update", updateErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Notes carries licenceCountry as a "Licence country: X" prefix
// followed by a blank line and the rest. Split helpers so we can
// rebuild it cleanly when one or the other field is edited.
function extractLicenceCountry(notes: string | null): string {
  if (!notes) return "";
  const m = notes.match(/^Licence country:\s*([^\n]+)/);
  return m ? m[1].trim() : "";
}
function stripLicenceCountry(notes: string | null): string {
  if (!notes) return "";
  return notes.replace(/^Licence country:[^\n]*\n*/, "").trim();
}
