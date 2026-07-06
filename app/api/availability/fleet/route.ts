import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isBookablePickupSlot, isBookableReturnSlot } from "@/lib/pricing";
import { SEASON_END_ISO } from "@/lib/season";
import { findFreeUnits, nextFreeWindow, earliestFreePickupSameDay, latestFreeReturnSameDay } from "@/lib/availability";
import { getUnitCounts } from "@/lib/bike-pricing";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/availability/fleet?from=&to=&pickupTime=&returnTime=
//
// Powers the multi-bike booking page (stage 2): for the chosen window,
// returns EVERY active model with how many units are free, and — for the
// ones that are fully booked — the nearest later window where the model
// would be free again ("available from"). The whole fleet always comes
// back so customers can re-plan, not just the bookable subset.
//
// Shape: { bikes: [{ bikeId, totalUnits, freeUnits, nextFree?: {from,to} }] }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const pickupTime = searchParams.get("pickupTime");
  const returnTime = searchParams.get("returnTime");

  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return NextResponse.json({ error: "Valid from/to dates are required" }, { status: 400 });
  }
  // Accept the outside-hours add-on slots too (07:00-08:30 / 19:30-22:00) — the
  // group dropdowns offer them and findFreeUnits works off real timestamps, so
  // a legit early/late selection must not 400 the availability lookup.
  if (!pickupTime || !returnTime || !isBookablePickupSlot(pickupTime) || !isBookableReturnSlot(returnTime)) {
    return NextResponse.json({ error: "Valid pickup/return times are required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const unitCounts = await getUnitCounts(); // { bikeId: activeNonBackupUnits }

  const bikes = await Promise.all(
    Object.entries(unitCounts).map(async ([bikeId, totalUnits]) => {
      const window = { bikeId, dateFrom: from, dateTo: to, pickupTime, returnTime };
      let freeUnits = 0;
      try {
        const res = await findFreeUnits(supabase, window, totalUnits);
        freeUnits = res.totalFree;
      } catch (err) {
        console.error("[/api/availability/fleet] findFreeUnits", bikeId, err);
      }
      // Fully-booked models get the "available from" hints. Prefer a
      // same-day later pickup time (most helpful when the conflict is only
      // a morning booking); fall back to the next free date otherwise.
      let freeFromTime: string | null = null;
      let freeIfReturnBy: string | null = null;
      let nextFree: { from: string; to: string; pickupTime: string } | null = null;
      if (freeUnits === 0) {
        try {
          freeFromTime = await earliestFreePickupSameDay(supabase, window);
        } catch (err) {
          console.error("[/api/availability/fleet] earliestFreePickupSameDay", bikeId, err);
        }
        if (!freeFromTime) {
          try {
            freeIfReturnBy = await latestFreeReturnSameDay(supabase, window);
          } catch (err) {
            console.error("[/api/availability/fleet] latestFreeReturnSameDay", bikeId, err);
          }
        }
        if (!freeFromTime && !freeIfReturnBy) {
          try {
            const w = await nextFreeWindow(supabase, window, { seasonEndIso: SEASON_END_ISO });
            if (w) nextFree = { from: w.dateFrom, to: w.dateTo, pickupTime: w.pickupTime };
          } catch (err) {
            console.error("[/api/availability/fleet] nextFreeWindow", bikeId, err);
          }
        }
      }
      return { bikeId, totalUnits, freeUnits, freeFromTime, freeIfReturnBy, nextFree };
    }),
  );

  return NextResponse.json({ bikes });
}
