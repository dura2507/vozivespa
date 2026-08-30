import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import {
  findFreeUnit,
  findFreeUnits,
  findUnitConflict,
  wholeModelBlockConflict,
  describeConflict,
  buildConflictCard,
  type Conflict,
  reserveBikeIds,
} from "@/lib/availability";
import { isValidSlot, isValidPickupSlot, parseTime } from "@/lib/pricing";
import { SEASON_END_ISO } from "@/lib/season";
import { CATEGORIES } from "@/lib/mockData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/bookings/manual
// { bikeId, dateFrom, dateTo, pickupTime, returnTime,
//   customerName, customerPhone?, customerEmail?, notes? }
//
// Owner-side flow for entering walk-in bookings (anything not booked
// via the website): writes a confirmed booking row directly so it
// appears in the dashboard's "upcoming" / "out" buckets just like a
// website booking that was then accepted. Runs the same availability
// check as the public flow so the owner can't double-book a unit.
//
// Customer email is the only optional contact field and is stored
// as null when blank — no acknowledgement mail is sent for walk-ins.
export async function POST(request: Request) {
  let body: {
    bikeId?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    pickupTime?: unknown;
    returnTime?: unknown;
    bikeUnitId?: unknown;
    bikeUnitIds?: unknown;
    customerName?: unknown;
    customerPhone?: unknown;
    customerEmail?: unknown;
    notes?: unknown;
    // Optional walk-in details the owner may fill in at creation
    // time or later via the edit form. All persist on the booking
    // row so the dashboard / detail page can show them.
    totalPriceEuros?: unknown;
    paymentMethod?: unknown;
    driversLicence?: unknown;
    ridingStyle?: unknown;
    licenceCountry?: unknown;
    // Language the owner speaks with this walk-in. Defaults to English
    // when missing / unknown so older clients keep working.
    locale?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bikeId = typeof body.bikeId === "string" ? body.bikeId.trim() : "";
  const dateFrom =
    typeof body.dateFrom === "string" && ISO_DATE.test(body.dateFrom) ? body.dateFrom : null;
  const dateTo =
    typeof body.dateTo === "string" && ISO_DATE.test(body.dateTo) ? body.dateTo : null;
  const pickupTime =
    typeof body.pickupTime === "string" && isValidPickupSlot(body.pickupTime) ? body.pickupTime : null;
  const returnTime =
    typeof body.returnTime === "string" && isValidSlot(body.returnTime) ? body.returnTime : null;
  const requestedUnitId =
    typeof body.bikeUnitId === "string" && body.bikeUnitId.trim().length > 0
      ? body.bikeUnitId.trim()
      : null;
  // Array form: book N specific units in one transaction. Used by
  // the "quantity > 1" path in the admin form where the client
  // pre-selects N unit ids from the available pool.
  const requestedUnitIds: string[] | null =
    Array.isArray(body.bikeUnitIds) && body.bikeUnitIds.every((u) => typeof u === "string" && u.length > 0)
      ? (body.bikeUnitIds as string[])
      : null;
  const customerName =
    typeof body.customerName === "string" && body.customerName.trim().length > 0
      ? body.customerName.trim()
      : null;
  const customerPhone =
    typeof body.customerPhone === "string" && body.customerPhone.trim().length > 0
      ? body.customerPhone.trim()
      : null;
  const customerEmail =
    typeof body.customerEmail === "string" && body.customerEmail.trim().length > 0
      ? body.customerEmail.trim()
      : null;
  const rawNotes =
    typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null;
  // Optional detail fields. All are nullable on the row, so a sloppy
  // walk-in with name+phone only still works; richer entries can have
  // price / licence / payment method filled in too. Numbers come in
  // as euros (frontend friendly), stored as cents on the row.
  const totalPriceCents = (() => {
    const v = body.totalPriceEuros;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v * 100);
    if (typeof v === "string" && v.trim().length > 0) {
      const n = parseFloat(v.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
    }
    return null;
  })();
  const PAYMENT_METHODS = ["paypal_ff", "paypal_company", "bank", "revolut"] as const;
  const paymentMethod =
    typeof body.paymentMethod === "string" &&
    (PAYMENT_METHODS as readonly string[]).includes(body.paymentMethod)
      ? (body.paymentMethod as (typeof PAYMENT_METHODS)[number])
      : null;
  const LICENCES = ["A", "A1", "A2", "AM", "B"] as const;
  const driversLicence =
    typeof body.driversLicence === "string" &&
    (LICENCES as readonly string[]).includes(body.driversLicence)
      ? (body.driversLicence as (typeof LICENCES)[number])
      : null;
  const RIDING_STYLES = ["solo", "with_passenger"] as const;
  const ridingStyle =
    typeof body.ridingStyle === "string" &&
    (RIDING_STYLES as readonly string[]).includes(body.ridingStyle)
      ? (body.ridingStyle as (typeof RIDING_STYLES)[number])
      : null;
  const licenceCountry =
    typeof body.licenceCountry === "string" && body.licenceCountry.trim().length > 0
      ? body.licenceCountry.trim()
      : null;
  // Spoken language for this walk-in. Mirrors the locales the public
  // site ships; anything unexpected falls back to English.
  const SPOKEN_LOCALES = ["en", "de", "hr", "it", "es", "fr", "pl"] as const;
  const locale =
    typeof body.locale === "string" &&
    (SPOKEN_LOCALES as readonly string[]).includes(body.locale)
      ? (body.locale as (typeof SPOKEN_LOCALES)[number])
      : "en";
  // Mirror the public booking flow: licenceCountry isn't its own
  // column, it lives prepended to notes so owner sees it in Telegram
  // / email / detail view without a schema change.
  const notes = licenceCountry
    ? `Licence country: ${licenceCountry}${rawNotes ? `\n\n${rawNotes}` : ""}`
    : rawNotes;

  if (!bikeId) return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }
  if (!pickupTime || !returnTime) {
    return NextResponse.json(
      { error: "Pickup and return times must be 09:00-19:00 in 30-minute slots" },
      { status: 400 },
    );
  }
  if (dateFrom === dateTo && parseTime(pickupTime)! >= parseTime(returnTime)!) {
    return NextResponse.json(
      { error: "Return time must be later than pickup time on a same-day booking" },
      { status: 400 },
    );
  }
  if (!customerName) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }
  if (!customerPhone) {
    // Owner must be able to reach the customer if anything goes
    // wrong with the rental. Email stays optional.
    return NextResponse.json(
      { error: "Phone is required for walk-in bookings" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // 1. Bike exists + active
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, active")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr) {
    console.error("[/api/admin/bookings/manual] bike lookup", bikeErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!bike || !bike.active) {
    return NextResponse.json({ error: "Bike not available" }, { status: 404 });
  }

  // Is the owner deliberately putting this walk-in on the Ghost Bike? That is
  // the whole point of the reserve: when all K regular bikes are out, the
  // owner still has one vehicle to hand over. It is a SEPARATE bike, so it is
  // validated against itself further down and must NOT be gated by the
  // regular fleet's capacity - otherwise the joker becomes unusable exactly
  // when it is needed.
  let explicitReserve = false;
  // A combined payload (bikeUnitId + bikeUnitIds) resolves to the quantity
  // branch further down, so the reserve intent would be silently dropped;
  // don't skip the capacity gate in that case.
  const hasUnitList = !!requestedUnitIds && requestedUnitIds.length > 0;
  if (requestedUnitId && requestedUnitId !== "all" && !hasUnitList) {
    const { data: reqUnit, error: reqErr } = await supabase
      .from("bike_units")
      .select("id, bike_id, active, is_backup")
      .eq("id", requestedUnitId)
      .maybeSingle<{ id: string; bike_id: string; active: boolean; is_backup: boolean }>();
    if (reqErr) {
      console.error("[/api/admin/bookings/manual] requested unit lookup", reqErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    // A reserve unit from a sharing partner (the one Liberty ghost serves
    // both Liberty variants) counts as "belongs"; anything else foreign 400s.
    const ownedBySharing =
      !!reqUnit &&
      (reqUnit.bike_id === bikeId ||
        (reqUnit.is_backup && reserveBikeIds(bikeId).includes(reqUnit.bike_id)));
    if (!reqUnit || !ownedBySharing) {
      return NextResponse.json({ error: "Unit doesn't belong to this bike" }, { status: 400 });
    }
    if (!reqUnit.active) {
      return NextResponse.json({ error: "Unit is inactive" }, { status: 400 });
    }
    explicitReserve = reqUnit.is_backup;
    if (explicitReserve) {
      // The reserve skips the fleet capacity gate, but a WHOLE-MODEL block
      // (season pause, recall) covers every vehicle of the model including
      // this one.
      const modelBlock = await wholeModelBlockConflict(supabase, {
        bikeId,
        dateFrom,
        dateTo,
        pickupTime,
        returnTime,
      });
      if (modelBlock) {
        return NextResponse.json(
          { error: `Can't book — ${describeConflict(modelBlock)}` },
          { status: 409 },
        );
      }
    }
  }

  // 2. Same overlap check as the public flow — the owner can't sneak
  //    in a walk-in that would conflict with a real booking. Capacity is the
  //    REGULAR fleet only; the reserve never enlarges it.
  let availability: { unitId: string | null; conflict: Conflict | null } = {
    unitId: null,
    conflict: null,
  };
  if (!explicitReserve) {
    try {
      availability = await findFreeUnit(supabase, {
        bikeId,
        dateFrom,
        dateTo,
        pickupTime,
        returnTime,
      });
    } catch (err) {
      console.error("[/api/admin/bookings/manual] availability lookup", err);
      return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
    }
  }
  if (availability.conflict) {
    const c = availability.conflict;
    const modelName = CATEGORIES.find((m) => m.id === bikeId)?.model ?? bikeId;
    const card = await buildConflictCard(
      supabase,
      { bikeId, dateFrom, dateTo, pickupTime, returnTime },
      c,
      modelName,
      { seasonEndIso: SEASON_END_ISO },
    );
    return NextResponse.json(
      { error: card.headline, detail: describeConflict(c), conflict: card },
      { status: 409 },
    );
  }

  // 2b. Figure out which physical units this walk-in covers:
  //     - "all"             → every active unit of the model (group booking)
  //     - bikeUnitIds array → those N specific units (quantity-based path)
  //     - <unit-id>         → exactly that unit, must be free
  //     - undefined         → just the auto-picked free unit (single)
  const unitsToBook: (string | null)[] = [];
  if (requestedUnitIds && requestedUnitIds.length > 0) {
    // Owner asked for N units of this model (the client picks N
    // unit-ids from the front of the list, but those IDs are only
    // a hint — the actual list of *free* units may not match if some
    // are mid-rental or service-blocked). Treat the request as a
    // quantity ask and pick whichever N units are actually free.
    const wanted = requestedUnitIds.length;
    const free = await findFreeUnits(
      supabase,
      { bikeId, dateFrom, dateTo, pickupTime, returnTime },
      wanted,
    );
    if (free.unitIds.length < wanted) {
      const detail = free.conflict ? describeConflict(free.conflict) : undefined;
      return NextResponse.json(
        {
          error: `Can't book — only ${free.unitIds.length} of ${wanted} requested units are free for this window (fleet has ${free.totalUnits} units, ${free.totalFree} currently free)`,
          detail,
        },
        { status: 409 },
      );
    }
    unitsToBook.push(...free.unitIds);
  } else if (requestedUnitId === "all") {
    const { data: allUnits, error: unitErr } = await supabase
      .from("bike_units")
      .select("id")
      .eq("bike_id", bikeId)
      .eq("active", true)
      // "All" means all BOOKABLE units - never the hidden Ghost Bike reserve,
      // or a walk-in "all" would silently book the Vespa too (K+1 rows).
      .eq("is_backup", false);
    if (unitErr) {
      console.error("[/api/admin/bookings/manual] all-units lookup", unitErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const unitIds = (allUnits ?? []).map((u) => (u as { id: string }).id);
    if (unitIds.length === 0) {
      return NextResponse.json({ error: "This bike has no active units" }, { status: 404 });
    }
    // Booking the WHOLE fleet: every unit must be free. Use the capacity
    // engine (which counts unassigned bike_unit_id = null bookings + service
    // blocks) rather than a per-unit findUnitConflict loop, which is
    // structurally blind to null-unit rows and could over-book.
    const free = await findFreeUnits(
      supabase,
      { bikeId, dateFrom, dateTo, pickupTime, returnTime },
      unitIds.length,
    );
    if (free.totalFree < unitIds.length) {
      return NextResponse.json(
        {
          error: `Can't book all units — only ${free.totalFree} of ${unitIds.length} free for this window`,
        },
        { status: 409 },
      );
    }
    unitsToBook.push(...unitIds);
  } else if (requestedUnitId) {
    // Ownership / active were already validated above (that is also where we
    // learned whether this is the reserve). What is left is: is this exact
    // vehicle free for the window?
    if (requestedUnitId !== availability.unitId) {
      const c = await findUnitConflict(supabase, {
        bikeUnitId: requestedUnitId,
        dateFrom,
        dateTo,
        pickupTime,
        returnTime,
      });
      if (c) {
        const detail =
          c.kind === "booking"
            ? `booked by ${c.customerName}`
            : c.reason
              ? `service: ${c.reason}`
              : "service block";
        return NextResponse.json(
          { error: `Selected unit is not free — ${detail}` },
          { status: 409 },
        );
      }
    }
    unitsToBook.push(requestedUnitId);
  } else {
    unitsToBook.push(availability.unitId);
  }

  // 3. Insert one confirmed booking per unit. No receipt, no payment
  //    method — walk-ins are handled outside the website. Group
  //    bookings (2+ units) carry a shared booking_group_id so the
  //    dashboard can collapse them into a single customer entry.
  const nowIso = new Date().toISOString();
  const groupId = unitsToBook.length > 1 ? crypto.randomUUID() : null;
  // The form's "Total price" is the price for the WHOLE booking. For a
  // group (N units) we split it evenly across the rows so the dashboard
  // (which sums the group) shows exactly what was entered — not N× it.
  // Remainder cents land on the first row so the sum is exact.
  const n = unitsToBook.length;
  const perUnitBase = totalPriceCents == null ? null : Math.floor(totalPriceCents / n);
  const remainderCents = totalPriceCents == null ? 0 : totalPriceCents - perUnitBase! * n;
  const rows = unitsToBook.map((unitId, i) => ({
    bike_id: bikeId,
    customer_name: customerName,
    customer_email: customerEmail ?? "",
    customer_phone: customerPhone ?? "",
    notes,
    date_from: dateFrom,
    date_to: dateTo,
    pickup_time: pickupTime,
    return_time: returnTime,
    total_price_cents:
      perUnitBase == null ? null : perUnitBase + (i === 0 ? remainderCents : 0),
    payment_method: paymentMethod,
    bike_unit_id: unitId,
    booking_group_id: groupId,
    drivers_licence: driversLicence,
    riding_style: ridingStyle,
    locale,
    status: "confirmed" as const,
    decided_at: nowIso,
  }));
  const { data: bookings, error: insertErr } = await supabase
    .from("bookings")
    .insert(rows)
    .select("id, status");
  if (insertErr || !bookings || bookings.length === 0) {
    console.error("[/api/admin/bookings/manual] insert", insertErr);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: bookings.length,
    ids: bookings.map((b) => (b as { id: string }).id),
  });
}
