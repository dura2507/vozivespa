import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { isValidSlot, parseTime, calculatePrice } from "@/lib/pricing";
import { isBookingInSeason, SEASON_START_ISO, SEASON_END_ISO } from "@/lib/season";
import { findFreeUnits } from "@/lib/availability";
import { getBikeWithPricing } from "@/lib/bike-pricing";
import { sendOwnerGroupBookingTelegram } from "@/lib/telegram";
import { sendCustomerBookingReceivedEmail } from "@/lib/email";
import {
  isAllowedReceiptMime,
  MAX_RECEIPT_BYTES,
  signedReceiptUrl,
  uploadReceipt,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

// POST /api/bookings/group . multipart/form-data
//
// Multi-bike booking: one customer rents several DIFFERENT bikes in a
// single booking, all for the SAME date/time window (per-bike windows
// can be added later — each row already carries its own dates). Mirrors
// the single-bike flow (/api/bookings) and the admin walk-in group
// pattern: N booking rows share one booking_group_id and one receipt.
//
// Fields: items (JSON [{ bikeId, quantity }]), name, email, phone,
// notes, licenceCountry, from, to, pickupTime, returnTime, paymentMethod,
// driversLicence, ridingStyle, locale, receipt (File).
//
// NOTE: not yet wired to any UI — the multi-bike selector (stage 2) will
// call this. Owner notifications are consolidated in stage 3.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = ["paypal_ff", "paypal_company", "bank", "revolut"] as const;
const LICENCES = ["A", "A1", "A2", "AM", "B"] as const;
const RIDING_STYLES = ["solo", "with_passenger"] as const;
const LOCALES = ["en", "de", "es", "it", "hr", "pl", "fr"] as const;

function asString(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function asIsoDate(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}
function asSlot(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && isValidSlot(v) ? v : null;
}
function inSet<T extends readonly string[]>(set: T, v: FormDataEntryValue | null): T[number] | null {
  return typeof v === "string" && (set as readonly string[]).includes(v) ? (v as T[number]) : null;
}

type Item = { bikeId: string; quantity: number };

function parseItems(raw: FormDataEntryValue | null): Item[] | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out: Item[] = [];
  for (const it of parsed) {
    if (!it || typeof it !== "object") return null;
    const bikeId = (it as { bikeId?: unknown }).bikeId;
    const quantity = (it as { quantity?: unknown }).quantity;
    if (typeof bikeId !== "string" || bikeId.trim().length === 0) return null;
    const q = typeof quantity === "number" ? quantity : Number(quantity);
    if (!Number.isInteger(q) || q < 1 || q > 20) return null;
    out.push({ bikeId: bikeId.trim(), quantity: q });
  }
  // Collapse duplicate bikeIds into a single summed quantity.
  const merged = new Map<string, number>();
  for (const it of out) merged.set(it.bikeId, (merged.get(it.bikeId) ?? 0) + it.quantity);
  return [...merged.entries()].map(([bikeId, quantity]) => ({ bikeId, quantity }));
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const items = parseItems(form.get("items"));
  const name = asString(form.get("name"));
  const email = asString(form.get("email"));
  const phone = asString(form.get("phone"));
  const rawNotes = asString(form.get("notes"));
  const licenceCountry = asString(form.get("licenceCountry"));
  const notes = licenceCountry
    ? `Licence country: ${licenceCountry}${rawNotes ? `\n\n${rawNotes}` : ""}`
    : rawNotes;
  const from = asIsoDate(form.get("from"));
  const to = asIsoDate(form.get("to"));
  const pickupTime = asSlot(form.get("pickupTime"));
  const returnTime = asSlot(form.get("returnTime"));
  const paymentMethod = inSet(PAYMENT_METHODS, form.get("paymentMethod"));
  const driversLicence = inSet(LICENCES, form.get("driversLicence"));
  const ridingStyle = inSet(RIDING_STYLES, form.get("ridingStyle"));
  const locale = inSet(LOCALES, form.get("locale")) ?? "en";
  const receipt = form.get("receipt");

  if (!items) return NextResponse.json({ error: "Pick at least one bike" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  if (!from || !to) return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  if (!isBookingInSeason(from, to)) {
    return NextResponse.json(
      { error: `Bookings are only available within our season (${SEASON_START_ISO} to ${SEASON_END_ISO}).` },
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
  if (!paymentMethod) return NextResponse.json({ error: "Pick a payment method for the deposit" }, { status: 400 });
  if (!driversLicence) return NextResponse.json({ error: "Pick your driver's licence category" }, { status: 400 });
  if (!ridingStyle) return NextResponse.json({ error: "Pick a riding style" }, { status: 400 });
  if (!(receipt instanceof File) || receipt.size === 0) {
    return NextResponse.json({ error: "Upload a receipt screenshot" }, { status: 400 });
  }
  if (!isAllowedReceiptMime(receipt.type)) {
    return NextResponse.json({ error: "Receipt must be a JPG, PNG, HEIC or PDF" }, { status: 400 });
  }
  if (receipt.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: "Receipt is too large (max 4 MB)" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const window = { dateFrom: from, dateTo: to, pickupTime, returnTime };

  // For each bike: confirm it exists + active, find `quantity` free
  // units for the shared window, and price it. Any shortfall aborts the
  // whole group (all-or-nothing) so the customer never gets a partial
  // booking.
  type Planned = { bikeId: string; unitIds: string[]; perUnitCents: number };
  const planned: Planned[] = [];
  let groupTotalCents = 0;

  for (const item of items) {
    const bike = await getBikeWithPricing(item.bikeId);
    if (!bike) {
      return NextResponse.json({ error: `Bike not available: ${item.bikeId}` }, { status: 404 });
    }
    let avail;
    try {
      avail = await findFreeUnits(supabase, { bikeId: item.bikeId, ...window }, item.quantity);
    } catch (err) {
      console.error("[/api/bookings/group] availability error", err);
      return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
    }
    if (avail.unitIds.length < item.quantity) {
      return NextResponse.json(
        {
          error: `${bike.shortName ?? bike.model}: only ${avail.totalFree} of ${item.quantity} available for these dates`,
          bikeId: item.bikeId,
        },
        { status: 409 },
      );
    }
    const price = calculatePrice(
      new Date(`${from}T00:00:00`),
      new Date(`${to}T00:00:00`),
      pickupTime,
      returnTime,
      bike.pricing,
    );
    if (!price) {
      return NextResponse.json({ error: `Could not price ${bike.shortName ?? bike.model}` }, { status: 400 });
    }
    const perUnitCents = price.totalPrice * 100;
    planned.push({ bikeId: item.bikeId, unitIds: avail.unitIds.slice(0, item.quantity), perUnitCents });
    groupTotalCents += perUnitCents * item.quantity;
  }

  // One group id ties the rows together; one row per physical unit.
  const groupId = crypto.randomUUID();
  const rows = planned.flatMap((p) =>
    p.unitIds.map((unitId) => ({
      bike_id: p.bikeId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      notes,
      date_from: from,
      date_to: to,
      pickup_time: pickupTime,
      return_time: returnTime,
      total_price_cents: p.perUnitCents,
      payment_method: paymentMethod,
      bike_unit_id: unitId,
      booking_group_id: groupId,
      drivers_licence: driversLicence,
      riding_style: ridingStyle,
      locale,
    })),
  );

  const { data: inserted, error: insertError } = await supabase
    .from("bookings")
    .insert(rows)
    .select("*");
  if (insertError || !inserted || inserted.length === 0) {
    console.error("[/api/bookings/group] insert error", insertError);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  // One shared receipt for the whole group, stored under the first row.
  const primaryId = (inserted[0] as BookingRow).id;
  let receiptPath: string;
  try {
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    receiptPath = await uploadReceipt(primaryId, { mime: receipt.type, bytes });
  } catch (err) {
    console.error("[/api/bookings/group] receipt upload failed", err);
    await supabase.from("bookings").delete().eq("booking_group_id", groupId);
    return NextResponse.json({ error: "Could not save your receipt . please try again" }, { status: 500 });
  }

  const { error: patchError } = await supabase
    .from("bookings")
    .update({ deposit_screenshot_path: receiptPath })
    .eq("booking_group_id", groupId);
  if (patchError) {
    console.error("[/api/bookings/group] patch error", patchError);
    await supabase.from("bookings").delete().eq("booking_group_id", groupId);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  // Notifications after the response: one consolidated owner Telegram
  // (all bikes in a single card) with the shared receipt, plus the
  // customer acknowledgement email. Best-effort; a notify failure must
  // not fail the booking that's already saved.
  const groupRows = inserted as BookingRow[];
  const receiptMime = receipt.type;
  after(async () => {
    let receiptUrl: string | null = null;
    try {
      receiptUrl = await signedReceiptUrl(receiptPath);
    } catch (err) {
      console.error("[/api/bookings/group] signed url failed", err);
    }
    const receiptForTg = receiptUrl ? { url: receiptUrl, mime: receiptMime } : undefined;
    const [tgRefs] = await Promise.allSettled([
      sendOwnerGroupBookingTelegram(groupRows, receiptForTg),
      sendCustomerBookingReceivedEmail(groupRows[0]),
    ]);
    if (tgRefs.status === "fulfilled" && tgRefs.value.length > 0) {
      await supabase
        .from("bookings")
        .update({ telegram_message_refs: tgRefs.value })
        .eq("booking_group_id", groupId);
    }
  });

  return NextResponse.json(
    {
      groupId,
      bookingIds: inserted.map((b) => (b as BookingRow).id),
      count: inserted.length,
      totalCents: groupTotalCents,
    },
    { status: 201 },
  );
}
