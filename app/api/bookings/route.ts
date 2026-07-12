import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendOwnerBookingTelegram } from "@/lib/telegram";
import { sendCustomerBookingReceivedEmail, sendOwnerBookingEmail } from "@/lib/email";
import { markEmailReadByHeader } from "@/lib/imap-mark";
import { isBookableReturnSlot, isBookablePickupSlot, parseTime } from "@/lib/pricing";
import { isBookingInSeason, isPickupInPast, SEASON_START_ISO, SEASON_END_ISO } from "@/lib/season";
import { onlinePaymentEnabled } from "@/lib/payments";
import { describeConflict, findFreeUnit, getBikeUnitLabel } from "@/lib/availability";
import {
  isAllowedReceiptMime,
  MAX_RECEIPT_BYTES,
  signedReceiptUrl,
  uploadReceipt,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = ["paypal_ff", "paypal_company", "bank", "revolut"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const LICENCES = ["A", "A1", "A2", "AM", "B"] as const;
type Licence = (typeof LICENCES)[number];

const RIDING_STYLES = ["solo", "with_passenger"] as const;
type RidingStyle = (typeof RIDING_STYLES)[number];

function asString(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asIsoDate(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

// Accepts in-hours return slots plus the late-return add-on slots (19:30-22:00).
function asSlot(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  return isBookableReturnSlot(v) ? v : null;
}

// Accepts in-hours pickup slots (never 19:00) plus the early-pickup add-on
// slots (07:00-08:30) — see isBookablePickupSlot.
function asPickupSlot(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  return isBookablePickupSlot(v) ? v : null;
}

function asPaymentMethod(v: FormDataEntryValue | null): PaymentMethod | null {
  if (typeof v !== "string") return null;
  return (PAYMENT_METHODS as readonly string[]).includes(v) ? (v as PaymentMethod) : null;
}

function asLicence(v: FormDataEntryValue | null): Licence | null {
  if (typeof v !== "string") return null;
  return (LICENCES as readonly string[]).includes(v) ? (v as Licence) : null;
}

function asRidingStyle(v: FormDataEntryValue | null): RidingStyle | null {
  if (typeof v !== "string") return null;
  return (RIDING_STYLES as readonly string[]).includes(v) ? (v as RidingStyle) : null;
}

function extensionFor(mime: string): string {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
      "application/pdf": "pdf",
    } as Record<string, string>
  )[mime] ?? "bin";
}

// POST /api/bookings . multipart/form-data
//
// Fields: bikeId, name, email, phone, notes, from, to, pickupTime,
// returnTime, totalPriceCents, paymentMethod, receipt (File).
//
// Flow:
//   1. Validate input + check overlap.
//   2. Insert pending booking row (without receipt path).
//   3. Upload receipt to Supabase Storage under bookings/{id}/receipt.{ext}.
//   4. Patch the booking with the storage path.
//   5. Fire owner Telegram + owner email + customer ack email after the
//      response so the customer's UI feels instant.
//
// On any storage failure we delete the just-inserted booking so the DB
// doesn't end up with a row referencing nothing.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const bikeId = asString(form.get("bikeId"));
  const name = asString(form.get("name"));
  const email = asString(form.get("email"));
  const phone = asString(form.get("phone"));
  const rawNotes = asString(form.get("notes"));
  const licenceCountry = asString(form.get("licenceCountry"));
  // Owner needs to see the licence country at a glance; prepend it to
  // notes so it shows in Telegram + email + admin detail without a
  // separate schema column.
  const notes = licenceCountry
    ? `Licence country: ${licenceCountry}${rawNotes ? `\n\n${rawNotes}` : ""}`
    : rawNotes;
  const from = asIsoDate(form.get("from"));
  const to = asIsoDate(form.get("to"));
  const pickupTime = asPickupSlot(form.get("pickupTime"));
  const returnTime = asSlot(form.get("returnTime"));
  const paymentMethod = asPaymentMethod(form.get("paymentMethod"));
  const driversLicence = asLicence(form.get("driversLicence"));
  const ridingStyle = asRidingStyle(form.get("ridingStyle"));
  const totalPriceRaw = form.get("totalPriceCents");
  const totalPriceCents =
    typeof totalPriceRaw === "string" && /^\d+$/.test(totalPriceRaw)
      ? parseInt(totalPriceRaw, 10)
      : null;
  const localeRaw = form.get("locale");
  const locale: "en" | "de" | "es" | "it" | "hr" | "pl" | "fr" =
    typeof localeRaw === "string" &&
    ["en", "de", "es", "it", "hr", "pl", "fr"].includes(localeRaw)
      ? (localeRaw as "en" | "de" | "es" | "it" | "hr" | "pl" | "fr")
      : "en";
  const receipt = form.get("receipt");
  // Online-payment path: the customer pays the deposit by card next, so no
  // screenshot is uploaded. Only honoured when online payment is actually
  // enabled server-side — you can't opt out of the screenshot otherwise.
  const payOnline = form.get("payOnline") === "1" && onlinePaymentEnabled();

  if (!bikeId) return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  if (!from || !to) return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  if (!isBookingInSeason(from, to)) {
    return NextResponse.json(
      {
        error: `Bookings are only available within our season (${SEASON_START_ISO} to ${SEASON_END_ISO}). Reach out via WhatsApp for off-season inquiries.`,
      },
      { status: 400 },
    );
  }
  if (!pickupTime || !returnTime) {
    return NextResponse.json(
      { error: "Pickup and return times must be 09:00-19:00 in 30-minute slots" },
      { status: 400 },
    );
  }
  if (from === to && parseTime(pickupTime)! >= parseTime(returnTime)!) {
    return NextResponse.json(
      { error: "Return time must be later than pickup time on a same-day booking" },
      { status: 400 },
    );
  }
  // Reject a pickup that has already passed (Zagreb time). Authoritative
  // backstop: no client can book a slot in the past, whatever it sent.
  if (isPickupInPast(from, pickupTime)) {
    return NextResponse.json(
      { error: "That pickup time has already passed. Please pick a later slot." },
      { status: 400 },
    );
  }
  // Payment method + receipt only matter for the manual (screenshot) flow.
  // When paying online, the card IS the payment method and no screenshot
  // is uploaded — the deposit is collected right after via the widget.
  if (!payOnline && !paymentMethod) {
    return NextResponse.json({ error: "Pick a payment method for the deposit" }, { status: 400 });
  }
  if (!driversLicence) {
    return NextResponse.json({ error: "Pick your driver's licence category" }, { status: 400 });
  }
  if (!ridingStyle) {
    return NextResponse.json({ error: "Pick a riding style" }, { status: 400 });
  }
  if (!payOnline) {
    if (!(receipt instanceof File) || receipt.size === 0) {
      return NextResponse.json({ error: "Upload a receipt screenshot" }, { status: 400 });
    }
    if (!isAllowedReceiptMime(receipt.type)) {
      return NextResponse.json(
        { error: "Receipt must be a JPG, PNG, HEIC or PDF" },
        { status: 400 },
      );
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: "Receipt is too large (max 4 MB)" }, { status: 400 });
    }
  }

  const supabase = getServiceClient();

  // 1. Bike must exist and be active
  const { data: bike, error: bikeError } = await supabase
    .from("bikes")
    .select("id, active")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeError) {
    console.error("[/api/bookings] bike lookup error", bikeError);
    return NextResponse.json({ error: "Could not validate bike" }, { status: 500 });
  }
  if (!bike || !bike.active) {
    return NextResponse.json({ error: "Bike not available" }, { status: 404 });
  }

  // 2. Find a free physical unit for this window. Manual blocks shut
  //    down the whole model; confirmed bookings hold a single unit and
  //    only block their unit (with 1h turnaround buffer). The same
  //    helper is used at confirm-time so a second pending booking
  //    can't sneak through while the first is still pending.
  let availability;
  try {
    availability = await findFreeUnit(supabase, {
      bikeId,
      dateFrom: from,
      dateTo: to,
      pickupTime,
      returnTime,
    });
  } catch (err) {
    console.error("[/api/bookings] availability lookup error", err);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  if (availability.conflict) {
    const c = availability.conflict;
    const message =
      c?.kind === "manual"
        ? "Selected dates are no longer available"
        : c?.kind === "no_units"
        ? "This bike isn't bookable right now . please contact us"
        : "Time conflict with another booking on this model . try a later pickup or earlier return time.";
    return NextResponse.json(
      { error: message, detail: c ? describeConflict(c) : undefined },
      { status: 409 },
    );
  }
  const assignedUnitId = availability.unitId;

  // 3. Insert
  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      bike_id: bikeId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      notes,
      date_from: from,
      date_to: to,
      pickup_time: pickupTime,
      return_time: returnTime,
      total_price_cents: totalPriceCents,
      payment_method: paymentMethod,
      bike_unit_id: assignedUnitId,
      drivers_licence: driversLicence,
      riding_style: ridingStyle,
      locale,
    })
    .select("*")
    .single();
  if (insertError || !booking) {
    console.error("[/api/bookings] insert error", insertError);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  // Online-payment path stops here: the booking is reserved (pending) and
  // holds the slot. The customer now pays the deposit by card; the payment
  // webhook / verify step promotes it to confirmed and fires the emails.
  // No receipt, no screenshot notification on this path.
  if (payOnline) {
    return NextResponse.json({
      ok: true,
      bookingId: booking.id,
      token: (booking as BookingRow).secret_token,
    });
  }

  // 4. Upload receipt + patch booking. Past this point we're on the manual
  // path (payOnline returned above), so the receipt is a validated File —
  // re-assert it so the type narrows for the upload below.
  if (!(receipt instanceof File)) {
    return NextResponse.json({ error: "Upload a receipt screenshot" }, { status: 400 });
  }
  let receiptPath: string;
  try {
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    receiptPath = await uploadReceipt(booking.id, { mime: receipt.type, bytes });
  } catch (err) {
    console.error("[/api/bookings] receipt upload failed", err);
    await supabase.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json(
      { error: "Could not save your receipt . please try again" },
      { status: 500 },
    );
  }

  const { data: patched, error: patchError } = await supabase
    .from("bookings")
    .update({ deposit_screenshot_path: receiptPath })
    .eq("id", booking.id)
    .select("*")
    .single();
  if (patchError || !patched) {
    console.error("[/api/bookings] patch error", patchError);
    await supabase.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  // 5. Notifications fan-out after the response.
  const finalBooking = patched as BookingRow;
  const receiptMime = receipt.type;
  const filename = `receipt-${booking.id.slice(0, 8)}.${extensionFor(receiptMime)}`;
  after(async () => {
    let receiptUrl: string | null = null;
    try {
      receiptUrl = await signedReceiptUrl(receiptPath);
    } catch (err) {
      console.error("[/api/bookings] signed url failed", err);
    }
    const unitLabel = await getBikeUnitLabel(supabase, finalBooking.bike_unit_id).catch(
      () => null,
    );
    const receipt = receiptUrl ? { url: receiptUrl, mime: receiptMime, filename } : undefined;
    const [tgRefsResult] = await Promise.allSettled([
      sendOwnerBookingTelegram(finalBooking, receipt, unitLabel),
      sendOwnerBookingEmail(finalBooking, receipt, unitLabel),
      sendCustomerBookingReceivedEmail(finalBooking),
    ]);
    // Persist the Telegram message ids so the admin status endpoint
    // can edit those exact messages later. Best-effort: if the DB
    // update fails we just lose the sync ability for this booking.
    const telegramOk =
      tgRefsResult.status === "fulfilled" && tgRefsResult.value.length > 0;
    if (telegramOk) {
      await supabase
        .from("bookings")
        .update({ telegram_message_refs: tgRefsResult.value })
        .eq("id", finalBooking.id);
      // Telegram is the primary owner channel — once the message
      // landed there we auto-archive the parallel email so the
      // inbox stays clean. If Telegram failed (rare) the email
      // stays unread as the backup signal.
      await markEmailReadByHeader("X-Booking-Id", finalBooking.id);
    }
  });

  return NextResponse.json(
    { id: booking.id, status: booking.status },
    { status: 201 },
  );
}
