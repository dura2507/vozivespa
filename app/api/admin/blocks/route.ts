import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isValidSlot, parseTime } from "@/lib/pricing";
import { findFreeUnits, describeConflict, reserveBikeIds } from "@/lib/availability";

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
  let unitIsGhost = false;
  if (bikeUnitId) {
    const { data: unit, error: unitErr } = await supabase
      .from("bike_units")
      .select("id, bike_id, active, is_backup")
      .eq("id", bikeUnitId)
      .maybeSingle();
    if (unitErr) {
      console.error("[/api/admin/blocks] unit lookup", unitErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const u = unit as { bike_id: string; active: boolean; is_backup: boolean } | null;
    const ghostShared = !!u && u.is_backup && reserveBikeIds(bikeId).includes(u.bike_id);
    if (!u || (u.bike_id !== bikeId && !ghostShared)) {
      return NextResponse.json({ error: "Unit doesn't belong to this bike" }, { status: 400 });
    }
    if (!u.active) {
      return NextResponse.json({ error: "Unit is inactive" }, { status: 400 });
    }
    // A block on the hidden ghost/backup reserve is off-the-books: it consumes
    // ZERO public capacity (every capacity fn skips out-of-pool block spans),
    // so it must not be gated against the regular fleet, and it must never
    // float onto a regular unit.
    unitIsGhost = u.is_backup;
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
  if (bikeUnitId && !unitIsGhost) {
    // ---- Capacity gate (the ONE invariant, see CALENDAR_MAP.md) ----
    // "1 of N in service" is one extra concurrent demand on the model, so the
    // block fits iff the capacity engine finds room for one more demand over
    // the block span. findFreeUnits counts EVERY overlapping booking (incl.
    // unpinned bike_unit_id=NULL rows and pending) plus existing per-unit
    // blocks. The old check here only looked at PINNED bookings per unit,
    // which both (a) falsely rejected when scattered pinned bookings touched
    // every unit while real peak demand was below K (Priscilla's half-day
    // block vs Antonio's week-long rental, 2026-07-23), and (b) silently
    // ignored unpinned demand (over-block risk).
    let cap;
    try {
      cap = await findFreeUnits(
        supabase,
        {
          bikeId,
          dateFrom,
          dateTo,
          pickupTime: startTime ?? "00:00",
          returnTime: endTime ?? "23:59",
        },
        1,
        // A service block is not a rental: the bike goes straight from the
        // mechanic to the next rider, so it gets NO trailing turnaround. Block
        // spans already count unbuffered as existing demand, and without this
        // flag the same block would be refused or accepted depending on whether
        // it or the rental happened to be entered first.
        { includeBackup: false, noTrailingBuffer: true },
      );
    } catch (err) {
      console.error("[/api/admin/blocks] capacity gate", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (cap.totalFree < 1) {
      const detail = cap.conflict ? ` ${describeConflict(cap.conflict)}.` : "";
      return NextResponse.json(
        {
          error: `Can't block — all ${cap.totalUnits} ${bikeId} are genuinely needed during this window.${detail} Free a bike first or pick another date/time.`,
        },
        { status: 409 },
      );
    }

    const [unitsRes, bookingsRes, blocksRes] = await Promise.all([
      // Only regular units: a floating service block must never auto-land on
      // the hidden ghost/backup reserve — that would silently consume the
      // owner's joker and (before the pool-filter fix) even public capacity.
      supabase.from("bike_units").select("id").eq("bike_id", bikeId).eq("active", true).eq("is_backup", false),
      supabase
        .from("bookings")
        .select("bike_unit_id, customer_name, date_from, date_to, pickup_time, return_time")
        .eq("bike_id", bikeId)
        // Pending holds a unit exactly like confirmed (the capacity gate above
        // counts it). Looking at confirmed only let a block land on a unit a
        // pending booking already held - the one way a block and a booking
        // could still end up sharing a unit id, which several read surfaces
        // then collapse into a single "out" bike.
        .in("status", ["confirmed", "pending"])
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

      // UTC date arithmetic: local-midnight Date + toISOString() shifts one
      // day early on any UTC+ server TZ (Zagreb dev box), silently blocking
      // the wrong dates. Date.UTC keeps the walk timezone-proof.
      const days: string[] = [];
      const [fy, fm, fd] = dateFrom.split("-").map(Number);
      const [ty, tm, td] = dateTo.split("-").map(Number);
      for (
        let t = Date.UTC(fy, fm - 1, fd);
        t <= Date.UTC(ty, tm - 1, td);
        t += 86_400_000
      ) {
        days.push(new Date(t).toISOString().slice(0, 10));
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
          // Capacity for one extra demand was proven by the gate above, so
          // this is pin-scatter: bookings spread across every unit with no
          // single bike free the whole day. We deliberately do NOT drop the
          // block onto a busy unit id — several consumers (homepage badge
          // buckets, per-unit panel) group blocks by unit id and would
          // miscount a shared id. Honest reject with the actual reason.
          return NextResponse.json(
            {
              error: `Can't place the block on ${day}: one more bike fits by total capacity, but bookings are spread across every ${bikeId} so no single bike is free that whole day. Try a time-bounded block (uncheck "All day") or move one booking first.`,
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
      // Pin-scatter (capacity proven above, but no single bike free for the
      // whole window). Never drop the block onto a busy unit id — downstream
      // consumers group blocks by unit id and would miscount. Honest reject.
      return NextResponse.json(
        {
          error: `Can't block this window: one more bike fits by total capacity, but bookings are spread across every ${bikeId} so no single bike is free for the entire window. Try a shorter window or move one booking first.`,
        },
        { status: 409 },
      );
    }
    targetUnitId = freeUnit;
  }

  // Whole-model block only: refuse when ANY live confirmed booking overlaps —
  // blocking the whole model while a customer holds a bike is a genuine
  // contradiction. Per-unit blocks are handled above: capacity-gated, then
  // placed on a unit with no pinned overlap (or honestly rejected on scatter).
  if (!targetUnitId) {
    const { data: clashBookings, error: clashErr } = await supabase
      .from("bookings")
      .select("id, customer_name, bike_unit_id, date_from, date_to, pickup_time, return_time")
      .eq("bike_id", bikeId)
      // Pending counts too: blocking the WHOLE model over a live pending
      // request would leave that customer unconfirmable (findFreeUnit rejects
      // any window covered by a whole-model block).
      .in("status", ["confirmed", "pending"])
      // A returned bike is free again — it must not veto a block (early
      // returns used to falsely conflict here).
      .is("returned_at", null)
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(5);
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
