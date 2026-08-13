import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import {
  findFreeUnits,
  findUnitConflict,
  findUnitForOwnerAction,
  reserveUnitIds,
  describeConflict,
  buildConflictCard,
} from "@/lib/availability";
import { isValidSlot, isValidPickupSlot, parseTime } from "@/lib/pricing";
import { SEASON_END_ISO } from "@/lib/season";
import { CATEGORIES } from "@/lib/mockData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = ["paypal_ff", "paypal_company", "bank", "revolut"] as const;
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
//
// GROUP bookings: a multi-bike order shares ONE booking_group_id and ONE
// rental window across N rows. Editing one bike used to update only that
// row, leaving its siblings on the old window (the group "split" -> phantom
// conflicts, Thomas 2026-07-17). When the edited row is part of a group with
// more than one active row, the shared fields (window + customer) are applied
// to the WHOLE group and capacity is re-checked for the new window on EACH
// sibling's model; per-bike fields (model, unit, price, licence category,
// riding style) stay on the edited row.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    bikeId?: unknown;
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
  const pickupTime = typeof body.pickupTime === "string" && isValidPickupSlot(body.pickupTime) ? body.pickupTime : null;
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

  // Allow owner to swap the bike model on a booking (e.g. customer
  // upgrades Duke 125 → Duke 390). Defaults to the current model so
  // older clients that don't send the field stay backward-compatible.
  // If unknown bike id is supplied, refuse rather than silently picking
  // the original.
  const targetBikeId =
    typeof body.bikeId === "string" && body.bikeId.length > 0
      ? body.bikeId
      : booking.bike_id;
  if (targetBikeId !== booking.bike_id) {
    const { data: bikeRow, error: bikeErr } = await supabase
      .from("bikes")
      .select("id, active")
      .eq("id", targetBikeId)
      .maybeSingle();
    if (bikeErr) {
      console.error("[/api/admin/bookings] bike lookup", bikeErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!bikeRow || !bikeRow.active) {
      return NextResponse.json({ error: "Target bike not available" }, { status: 400 });
    }
  }

  // Is this row part of a *live* multi-bike group? We route on the count of
  // ACTIVE (non-cancelled) rows, NOT on booking_group_id being non-null: the
  // website group-checkout stamps a group id even on a 1-bike order, and a
  // group cancelled down to one bike keeps its id. Those are effectively solo
  // and must take the exact original single-row path (byte-identical, incl.
  // the label-first unit reassignment) — only a genuine 2+ active-row group
  // moves as a set.
  const groupId = booking.booking_group_id;
  let groupLive: BookingRow[] = [];
  if (groupId) {
    const { data: groupData, error: gErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_group_id", groupId);
    if (gErr) {
      console.error("[/api/admin/bookings] group lookup", gErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    // "Live" = still part of the running rental: not cancelled AND not already
    // returned. A returned sibling (returned_at set, status still confirmed) is
    // DONE — it must not move with the group window, must not be re-pinned, and
    // must not count toward capacity. findFreeUnits already excludes returned
    // rows from demand, so counting it here would desync supply and demand and
    // falsely reject an edit that actually fits.
    groupLive = ((groupData ?? []) as BookingRow[]).filter(
      (r) => r.status !== "cancelled" && r.returned_at == null,
    );
  }
  const isGroup =
    !!groupId &&
    booking.status !== "cancelled" &&
    booking.returned_at == null &&
    groupLive.length > 1;

  let assignedUnitId: string | null = booking.bike_unit_id;
  // Group path only: row.id -> the physical unit it should hold for the NEW
  // window. Filled in below, applied when the group is persisted.
  const groupAssignment = new Map<string, string | null>();

  if (!isGroup) {
    // ---------- single booking: EXACT original behaviour ----------
    try {
      // Capacity is the REGULAR fleet only, same as for customers. The Ghost
      // Bike is a separate vehicle the owner assigns by hand; the helper only
      // keeps an EXISTING ghost parking alive, it never adds capacity.
      const availability = await findUnitForOwnerAction(
        supabase,
        {
          bikeId: targetBikeId,
          dateFrom,
          dateTo,
          pickupTime,
          returnTime,
          // Only exclude this booking from conflicts when the model isn't
          // changing — otherwise the old unit (on the original model) was
          // never going to overlap anyway, and excluding by booking id on
          // the new model has no effect.
          excludeBookingId: targetBikeId === booking.bike_id ? booking.id : undefined,
        },
        // A unit pin only means anything while the model stays the same.
        targetBikeId === booking.bike_id ? booking.bike_unit_id : null,
      );
      if (availability.conflict) {
        const modelName = CATEGORIES.find((m) => m.id === targetBikeId)?.model ?? targetBikeId;
        const card = await buildConflictCard(
          supabase,
          { bikeId: targetBikeId, dateFrom, dateTo, pickupTime, returnTime, excludeBookingId: targetBikeId === booking.bike_id ? booking.id : undefined },
          availability.conflict,
          modelName,
          { seasonEndIso: SEASON_END_ISO },
        );
        return NextResponse.json(
          {
            error:
              targetBikeId === booking.bike_id
                ? "Time conflict"
                : "No free unit on the new model for this window",
            detail: describeConflict(availability.conflict),
            conflict: card,
          },
          { status: 409 },
        );
      }
      // findUnitForOwnerAction already preserved an existing Ghost Bike
      // parking when the reserve is still free for the new window, so the
      // rider stays on the vehicle they are physically sitting on.
      assignedUnitId = availability.unitId;
    } catch (err) {
      console.error("[/api/admin/bookings] availability", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  } else {
    // ---------- group booking: move the WHOLE group together ----------
    // Each active row keeps its OWN model; only the edited row may swap model.
    // Re-check capacity for the NEW window on EACH model, excluding the ENTIRE
    // group from the conflict set (they move as one). If any model can't fit
    // its rows, abort the whole edit and write NOTHING (return the card).
    const plan = groupLive.map((r) => ({
      row: r,
      bikeId: r.id === booking.id ? targetBikeId : r.bike_id,
    }));
    const byModel = new Map<string, { row: BookingRow; bikeId: string }[]>();
    for (const p of plan) {
      const arr = byModel.get(p.bikeId) ?? [];
      arr.push(p);
      byModel.set(p.bikeId, arr);
    }

    // The Ghost Bike is a SEPARATE vehicle, never part of a model's capacity.
    // A sibling already parked on it keeps that parking and does not demand a
    // regular bike; everything else is measured against the regular fleet,
    // exactly like the public site.
    let backupUnitIds: Set<string>;
    try {
      backupUnitIds = await reserveUnitIds(supabase, [...byModel.keys()]);
    } catch (err) {
      console.error("[/api/admin/bookings] reserve unit lookup", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    try {
      for (const [bikeId, allRows] of byModel) {
        // Split off rows sitting on the reserve: they stay there while the
        // reserve is free for the new window, and never consume regular
        // capacity.
        const rows: typeof allRows = [];
        for (const p of allRows) {
          const cur = p.row.bike_unit_id;
          const modelUnchanged = p.bikeId === p.row.bike_id;
          if (cur && modelUnchanged && backupUnitIds.has(cur)) {
            const clash = await findUnitConflict(supabase, {
              bikeUnitId: cur,
              dateFrom,
              dateTo,
              pickupTime,
              returnTime,
              excludeBookingId: p.row.id,
            });
            if (!clash) {
              groupAssignment.set(p.row.id, cur);
              continue;
            }
            // Reserve taken for the new window: this row needs a regular bike.
          }
          rows.push(p);
        }
        if (rows.length === 0) continue;

        // Ask for the full free pool (large count) so the distribution below
        // can pick freely. The whole group is excluded, so a row's OWN current
        // unit shows up as free here.
        const free = await findFreeUnits(
          supabase,
          { bikeId, dateFrom, dateTo, pickupTime, returnTime, excludeGroupId: groupId },
          Math.max(rows.length, 999),
        );
        // Gate on capacity only (with a large count, free.conflict may be set
        // even when the group fits, so it is read solely on the miss path).
        if (free.totalFree < rows.length) {
          const modelName = CATEGORIES.find((m) => m.id === bikeId)?.model ?? bikeId;
          const conflict = free.conflict ?? { kind: "no_units" as const };
          const card = await buildConflictCard(
            supabase,
            { bikeId, dateFrom, dateTo, pickupTime, returnTime, excludeGroupId: groupId },
            conflict,
            modelName,
            { seasonEndIso: SEASON_END_ISO },
          );
          return NextResponse.json(
            { error: "Time conflict", detail: describeConflict(conflict), conflict: card },
            { status: 409 },
          );
        }
        // Distribute distinct free units. Keep a row on its CURRENT unit when
        // the model is unchanged and that unit is still free, so a window edit
        // doesn't shuffle bikes for no reason. The pool holds regular units
        // only (rows on the reserve were split off above), so the Ghost Bike
        // can never be handed out here.
        const pool = free.unitIds.filter((u): u is string => u !== null);
        const poolSet = new Set(pool);
        const taken = new Set<string>();
        const needUnit: { row: BookingRow; bikeId: string }[] = [];
        for (const p of rows) {
          const cur = p.row.bike_unit_id;
          const modelUnchanged = p.bikeId === p.row.bike_id;
          if (cur && modelUnchanged && poolSet.has(cur) && !taken.has(cur)) {
            groupAssignment.set(p.row.id, cur);
            taken.add(cur);
          } else {
            needUnit.push(p);
          }
        }
        // Pad with null (capacity-proven but unpinned) if the pool runs dry.
        const spare = pool.filter((u) => !taken.has(u));
        let si = 0;
        for (const p of needUnit) {
          groupAssignment.set(p.row.id, si < spare.length ? spare[si++] : null);
        }
      }
    } catch (err) {
      console.error("[/api/admin/bookings] group availability", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  // ---------- Optional customer + detail fields ----------
  // Each follows the same pattern: only updates when present + valid;
  // empty string is interpreted as "clear this field" so owner can
  // remove a wrong note / email; undefined leaves the column alone.

  const updateRow: Partial<BookingRow> = {
    bike_id: targetBikeId,
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

  if (!isGroup) {
    // ---------- single booking: EXACT original write ----------
    const { error: updateErr } = await supabase
      .from("bookings")
      .update(updateRow)
      .eq("id", id);
    if (updateErr) {
      console.error("[/api/admin/bookings] update", updateErr);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
  } else {
    // ---------- group booking: propagate SHARED fields, keep PER-BIKE ----------
    // 1) Window + customer details (incl. licence category + country, one
    //    customer per group) go to EVERY non-cancelled row in ONE statement,
    //    so the shared window can never diverge again. This is the
    //    correctness-critical write and it is atomic on its own.
    const SHARED_KEYS = [
      "date_from", "date_to", "pickup_time", "return_time",
      "customer_name", "customer_phone", "customer_email",
      "notes", "payment_method", "drivers_licence",
    ] as const;
    const sharedUpdate: Partial<BookingRow> = {};
    for (const k of SHARED_KEYS) {
      if (k in updateRow) {
        (sharedUpdate as Record<string, unknown>)[k] = (updateRow as Record<string, unknown>)[k];
      }
    }
    const { error: sharedErr } = await supabase
      .from("bookings")
      .update(sharedUpdate)
      .eq("booking_group_id", groupId)
      .neq("status", "cancelled")
      // Don't shift the window of a sibling that's already back (returned_at
      // set) — it's DONE and not one of the live rows we re-checked/re-pinned.
      .is("returned_at", null);
    if (sharedErr) {
      console.error("[/api/admin/bookings] group shared update", sharedErr);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // 2) Per-row physical unit recomputed for the new window (per-bike, so one
    //    statement per row — values differ).
    for (const [rowId, unitId] of groupAssignment) {
      const { error: unitErr } = await supabase
        .from("bookings")
        .update({ bike_unit_id: unitId })
        .eq("id", rowId);
      if (unitErr) {
        console.error("[/api/admin/bookings] group unit update", unitErr);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
    }

    // 3) Per-bike fields that belong to the EDITED row only (model swap,
    //    price, riding style). Riding style is genuinely per-rider in a group;
    //    the licence + window + customer already went out group-wide in step 1.
    const editedPerBike: Partial<BookingRow> = { bike_id: targetBikeId };
    for (const k of ["total_price_cents", "riding_style"] as const) {
      if (k in updateRow) {
        (editedPerBike as Record<string, unknown>)[k] = (updateRow as Record<string, unknown>)[k];
      }
    }
    const { error: editedErr } = await supabase
      .from("bookings")
      .update(editedPerBike)
      .eq("id", booking.id);
    if (editedErr) {
      console.error("[/api/admin/bookings] group edited update", editedErr);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
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
