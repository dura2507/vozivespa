import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isValidSlot, parseTime } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/blocks
// { bikeId, dateFrom, dateTo, bikeUnitId?, reason? }
//
// Manual full-day owner block. With `bikeUnitId` the block targets a
// single physical unit (other units of the same model stay bookable);
// without it the block covers the whole model. `reason` is a free-text
// note shown in the dashboard ("Reparatur", "Service", "Privat").
// booking_id stays null so the public availability endpoint treats it
// as a hard full-day block.
export async function POST(request: Request) {
  let body: {
    bikeId?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    bikeUnitId?: unknown;
    reason?: unknown;
    startTime?: unknown;
    endTime?: unknown;
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
  const bikeUnitId =
    typeof body.bikeUnitId === "string" && body.bikeUnitId.trim().length > 0
      ? body.bikeUnitId.trim()
      : null;
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 200)
      : null;
  // Time window: either both set (time-bounded block) or both null
  // (whole-day block). A half-spec is rejected to avoid ambiguous data.
  const startTime =
    typeof body.startTime === "string" && isValidSlot(body.startTime) ? body.startTime : null;
  const endTime =
    typeof body.endTime === "string" && isValidSlot(body.endTime) ? body.endTime : null;
  if ((startTime && !endTime) || (!startTime && endTime)) {
    return NextResponse.json(
      { error: "Provide both start and end time, or neither" },
      { status: 400 },
    );
  }
  if (startTime && endTime && parseTime(startTime)! >= parseTime(endTime)!) {
    return NextResponse.json(
      { error: "End time must be later than start time" },
      { status: 400 },
    );
  }

  if (!bikeId) return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr) {
    console.error("[/api/admin/blocks] bike lookup", bikeErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!bike) return NextResponse.json({ error: "Bike not found" }, { status: 404 });

  // Sanity-check the unit belongs to the bike — otherwise a typo
  // would block the wrong model silently.
  if (bikeUnitId) {
    const { data: unit, error: unitErr } = await supabase
      .from("bike_units")
      .select("id, bike_id")
      .eq("id", bikeUnitId)
      .maybeSingle();
    if (unitErr) {
      console.error("[/api/admin/blocks] unit lookup", unitErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!unit || (unit as { bike_id: string }).bike_id !== bikeId) {
      return NextResponse.json({ error: "Unit doesn't belong to this bike" }, { status: 400 });
    }
  }

  // A single-unit service block ("1 of N out for repair") shouldn't be
  // pinned to one physical unit — the units are identical, so the block
  // should float onto whichever unit is free each day. The UI always
  // sends the FIRST unit, which is often the busy one. So for an ALL-DAY
  // per-unit block we assign day-by-day: each day grabs a free unit
  // (preferring to stay on the same unit for tidy rows), and we only
  // conflict when a day has NO free unit (every bike genuinely needed).
  // Time-bounded per-unit blocks keep the simpler whole-window pick.
  let targetUnitId = bikeUnitId;
  if (bikeUnitId) {
    const [unitsRes, bookingsRes, blocksRes] = await Promise.all([
      // Only regular units: a floating service block must never auto-land on
      // the hidden ghost/backup reserve — that would silently consume the
      // owner's joker and (before the pool-filter fix) even public capacity.
      supabase.from("bike_units").select("id").eq("bike_id", bikeId).eq("active", true).eq("is_backup", false),
      supabase
        .from("bookings")
        .select("bike_unit_id, customer_name, date_from, date_to, pickup_time, return_time")
        .eq("bike_id", bikeId)
        .eq("status", "confirmed")
        .not("bike_unit_id", "is", null)
        .is("returned_at", null)
        .lte("date_from", dateTo)
        .gte("date_to", dateFrom),
      supabase
        .from("blocked_dates")
        .select("bike_unit_id, date_from, date_to, start_time, end_time")
        .eq("bike_id", bikeId)
        .is("booking_id", null)
        .not("bike_unit_id", "is", null)
        .lte("date_from", dateTo)
        .gte("date_to", dateFrom),
    ]);
    if (unitsRes.error || bookingsRes.error || blocksRes.error) {
      console.error("[/api/admin/blocks] capacity lookup", unitsRes.error || bookingsRes.error || blocksRes.error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const unitIds = (unitsRes.data ?? []).map((u) => (u as { id: string }).id);
    type B = { bike_unit_id: string; customer_name: string; date_from: string; date_to: string; pickup_time: string; return_time: string };
    type M = { bike_unit_id: string; date_from: string; date_to: string; start_time: string | null; end_time: string | null };
    const bookings = (bookingsRes.data ?? []) as B[];
    const blocks = (blocksRes.data ?? []) as M[];

    if (!startTime && !endTime) {
      // ----- All-day block: float per day across free units -----
      const occupiedOn = (uid: string, day: string): B | M | null => {
        for (const bk of bookings) {
          if (bk.bike_unit_id === uid && bk.date_from <= day && day <= bk.date_to) return bk;
        }
        for (const bl of blocks) {
          if (bl.bike_unit_id === uid && bl.date_from <= day && day <= bl.date_to) return bl;
        }
        return null;
      };

      const days: string[] = [];
      for (
        let d = new Date(`${dateFrom}T00:00:00`);
        d <= new Date(`${dateTo}T00:00:00`);
        d = new Date(d.getTime() + 86_400_000)
      ) {
        days.push(d.toISOString().slice(0, 10));
      }

      type Run = { unit: string; from: string; to: string };
      const runs: Run[] = [];
      let prev: string | null = null;
      for (const day of days) {
        const candidates: string[] = [];
        for (const u of [prev, bikeUnitId, ...unitIds]) {
          if (u && !candidates.includes(u)) candidates.push(u);
        }
        const unit = candidates.find((u) => !occupiedOn(u, day));
        if (!unit) {
          // Every unit busy this day → genuine over-capacity. If the
          // clashing booking starts LATER on this day, tell the owner
          // exactly how to work around it: uncheck "All day" and end the
          // block 30 min before pickup.
          const clash = bookings.find((bk) => bk.date_from <= day && day <= bk.date_to);
          const who = clash ? ` (${clash.customer_name})` : "";
          let suggestion = "";
          if (clash && clash.date_from === day && clash.pickup_time) {
            const [h, m] = clash.pickup_time.split(":").map((x) => parseInt(x, 10));
            const totalMin = h * 60 + m - 30; // turnaround window
            if (totalMin > 9 * 60) {
              const sh = String(Math.floor(totalMin / 60)).padStart(2, "0");
              const sm = String(totalMin % 60).padStart(2, "0");
              suggestion = ` Uncheck "All day" and set End time to ${sh}:${sm} to block up to the turnaround.`;
            }
          }
          return NextResponse.json(
            {
              error: `Can't block — every ${bikeId} is booked on ${day}${who}.${suggestion}`,
            },
            { status: 409 },
          );
        }
        const last = runs[runs.length - 1];
        if (last && last.unit === unit) last.to = day;
        else runs.push({ unit, from: day, to: day });
        prev = unit;
      }

      const { error: insertErr } = await supabase.from("blocked_dates").insert(
        runs.map((r) => ({
          bike_id: bikeId,
          bike_unit_id: r.unit,
          date_from: r.from,
          date_to: r.to,
          start_time: null,
          end_time: null,
          reason,
        })),
      );
      if (insertErr) {
        console.error("[/api/admin/blocks] insert", insertErr);
        return NextResponse.json({ error: "Could not save block" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, units: runs.length });
    }

    // ----- Time-bounded block: pick a unit free for the whole window -----
    const overlaps = (oFrom: string, oTo: string, oStart: string | null, oEnd: string | null): boolean => {
      if (!oStart || !oEnd) return true;
      const a = new Date(`${oFrom}T${oStart}`).getTime();
      const b = new Date(`${oTo}T${oEnd}`).getTime();
      const bs = new Date(`${dateFrom}T${startTime}`).getTime();
      const be = new Date(`${dateTo}T${endTime}`).getTime();
      return bs < b && a < be;
    };
    const unitIsFree = (uid: string): boolean =>
      !bookings.some((bk) => bk.bike_unit_id === uid && overlaps(bk.date_from, bk.date_to, bk.pickup_time, bk.return_time)) &&
      !blocks.some((bl) => bl.bike_unit_id === uid && overlaps(bl.date_from, bl.date_to, bl.start_time, bl.end_time));
    const freeUnit = unitIsFree(bikeUnitId) ? bikeUnitId : unitIds.find((u) => unitIsFree(u));
    if (!freeUnit) {
      const clash = bookings.find((bk) => overlaps(bk.date_from, bk.date_to, bk.pickup_time, bk.return_time));
      const who = clash ? ` (${clash.customer_name}, pickup ${clash.date_from} ${clash.pickup_time?.slice(0,5) ?? ""})` : "";
      return NextResponse.json(
        { error: `Can't block — every ${bikeId} is needed during this window${who}.` },
        { status: 409 },
      );
    }
    targetUnitId = freeUnit;
  }

  // Refuse a service block that would land on top of an existing
  // confirmed customer booking — the bike physically can't be both
  // with the customer and in the shop. Owner needs to cancel the
  // booking first or pick a different unit / date. Same check covers
  // whole-model blocks (bikeUnitId null) by widening the unit filter.
  const conflictQuery = supabase
    .from("bookings")
    .select("id, customer_name, bike_unit_id, date_from, date_to, pickup_time, return_time")
    .eq("bike_id", bikeId)
    .eq("status", "confirmed")
    .lte("date_from", dateTo)
    .gte("date_to", dateFrom)
    .limit(5);
  // Per-unit block only conflicts with bookings on that same unit;
  // whole-model block conflicts with any confirmed booking on the model.
  const { data: clashBookings, error: clashErr } = targetUnitId
    ? await conflictQuery.eq("bike_unit_id", targetUnitId)
    : await conflictQuery;
  if (clashErr) {
    console.error("[/api/admin/blocks] conflict lookup", clashErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  // Time-bounded block: only conflict on actual time overlap. Whole-
  // day block conflicts with anything on those dates.
  const realClashes = (clashBookings ?? []).filter((b) => {
    if (!startTime || !endTime) return true;
    const r = b as {
      date_from: string;
      date_to: string;
      pickup_time: string;
      return_time: string;
    };
    const bookStart = new Date(`${r.date_from}T${r.pickup_time}`).getTime();
    const bookEnd = new Date(`${r.date_to}T${r.return_time}`).getTime();
    const blockStart = new Date(`${dateFrom}T${startTime}`).getTime();
    const blockEnd = new Date(`${dateTo}T${endTime}`).getTime();
    return blockStart < bookEnd && bookStart < blockEnd;
  });
  if (realClashes.length > 0) {
    const c = realClashes[0] as { customer_name: string; date_from: string; date_to: string };
    return NextResponse.json(
      {
        error: `Can't block — conflicts with confirmed booking for ${c.customer_name} (${c.date_from} → ${c.date_to}). Cancel the booking first or pick another unit.`,
      },
      { status: 409 },
    );
  }

  // Also refuse if another manual block already covers the same unit
  // and overlaps. Stops the owner from accidentally double-blocking
  // a unit and inflating the "out" count.
  const existingBlockQuery = supabase
    .from("blocked_dates")
    .select("id, date_from, date_to, start_time, end_time, reason")
    .eq("bike_id", bikeId)
    .is("booking_id", null)
    .lte("date_from", dateTo)
    .gte("date_to", dateFrom)
    .limit(5);
  const { data: existingBlocks, error: existingErr } = targetUnitId
    ? await existingBlockQuery.eq("bike_unit_id", targetUnitId)
    : await existingBlockQuery.is("bike_unit_id", null);
  if (existingErr) {
    console.error("[/api/admin/blocks] existing-block lookup", existingErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const realBlockClashes = (existingBlocks ?? []).filter((b) => {
    const r = b as {
      date_from: string;
      date_to: string;
      start_time: string | null;
      end_time: string | null;
    };
    if (!startTime || !endTime || !r.start_time || !r.end_time) return true;
    const exStart = new Date(`${r.date_from}T${r.start_time}`).getTime();
    const exEnd = new Date(`${r.date_to}T${r.end_time}`).getTime();
    const blockStart = new Date(`${dateFrom}T${startTime}`).getTime();
    const blockEnd = new Date(`${dateTo}T${endTime}`).getTime();
    return blockStart < exEnd && exStart < blockEnd;
  });
  if (realBlockClashes.length > 0) {
    return NextResponse.json(
      { error: "An overlapping block already exists for this unit and window." },
      { status: 409 },
    );
  }

  const { error: insertErr } = await supabase.from("blocked_dates").insert({
    bike_id: bikeId,
    bike_unit_id: targetUnitId,
    date_from: dateFrom,
    date_to: dateTo,
    start_time: startTime,
    end_time: endTime,
    reason,
  });
  if (insertErr) {
    console.error("[/api/admin/blocks] insert", insertErr);
    return NextResponse.json({ error: "Could not save block" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
