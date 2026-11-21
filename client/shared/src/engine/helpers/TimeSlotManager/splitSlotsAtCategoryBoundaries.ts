import { AvailableSlot, Slot } from "../../models/TimeSlot";
import type { CategoryWindowPeriod } from "./expandCategoryWindowPeriods";

type Period = {
  start: Date;
  end: Date;
  locationId: string | null;
  categoryId: string;
  isStrict: boolean;
};

// Resolve all pre-expanded window periods that overlap a single available
// slot, clipped to the slot's extent. Periods arrive exception-adjusted and
// start-sorted from expandCategoryWindowPeriods.
function findPeriodsForSlot(
  slot: AvailableSlot,
  windowPeriods: CategoryWindowPeriod[],
): Period[] {
  const slotStartMs = slot.start.getTime();
  const slotEndMs = slot.end.getTime();

  const periods: Period[] = [];

  for (const period of windowPeriods) {
    const startMs = Math.max(period.start.getTime(), slotStartMs);
    const endMs = Math.min(period.end.getTime(), slotEndMs);
    if (startMs < endMs) {
      periods.push({
        start: new Date(startMs),
        end: new Date(endMs),
        locationId: period.locationId,
        categoryId: period.categoryId,
        isStrict: period.isStrict,
      });
    }
  }

  periods.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Overlapping category periods are not modelled. Drop later ones that start
  // before an earlier one ends — keep the earliest. Revisit if seeds start
  // emitting overlapping categories.
  const result: Period[] = [];
  for (const p of periods) {
    const last = result[result.length - 1];
    if (!last || p.start.getTime() >= last.end.getTime()) result.push(p);
  }
  return result;
}

// Carve a single available slot into a sequence of (Available | Category)
// fragments. Every fragment carries honest prev/next: prev is where the
// user arrives from, next is where they're heading. entryLocationId
// tracks the user's location at each fragment boundary (mirroring how
// cursorMs tracks the time boundary). The walker's "Current type:
// Available" tree handles any prev != next inside an Available fragment;
// the category dispatcher branch only fires at edges where no Available
// exists to absorb the transition.
function splitOneSlot(slot: AvailableSlot, periods: Period[]): Slot[] {
  if (periods.length === 0) return [slot];

  const fragments: Slot[] = [];
  const slotEndMs = slot.end.getTime();
  const slotNext = slot.nextLocationId ?? null;

  let cursorMs = slot.start.getTime();
  let entryLocationId = slot.prevLocationId ?? null;

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const pStartMs = p.start.getTime();
    const pEndMs = p.end.getTime();
    const isLast = i === periods.length - 1;

    if (cursorMs < pStartMs) {
      const gapMinutes = Math.floor((pStartMs - cursorMs) / 60000);
      if (gapMinutes > 0) {
        fragments.push({
          start: new Date(cursorMs),
          end: p.start,
          durationMinutes: gapMinutes,
          type: "available",
          prevLocationId: entryLocationId,
          nextLocationId: p.locationId,
        });
        entryLocationId = p.locationId;
      }
      // sub-minute gaps are dropped: the walker's bleed/cascade logic
      // would otherwise consume entire neighbors to fill what's effectively
      // zero free time, producing visually noisy travel placements. The
      // next emitted fragment's prev stays at the previous slot's location
      // so the dispatcher routes the transition through the category's
      // entry edge instead.
    }

    const catMinutes = Math.floor((pEndMs - pStartMs) / 60000);
    if (catMinutes > 0) {
      const catNext = isLast ? slotNext : periods[i + 1].locationId;
      fragments.push({
        start: p.start,
        end: p.end,
        durationMinutes: catMinutes,
        type: "category",
        currentLocationId: p.locationId,
        prevLocationId: entryLocationId,
        nextLocationId: catNext,
        categoryId: p.categoryId,
        isStrictCategory: p.isStrict,
      });
      entryLocationId = p.locationId;
    }

    cursorMs = pEndMs;
  }

  if (cursorMs < slotEndMs) {
    const trailingMinutes = Math.floor((slotEndMs - cursorMs) / 60000);
    if (trailingMinutes > 0) {
      fragments.push({
        start: new Date(cursorMs),
        end: slot.end,
        durationMinutes: trailingMinutes,
        type: "available",
        prevLocationId: entryLocationId,
        nextLocationId: slotNext,
      });
    }
  }

  return fragments;
}

export function splitSlotsAtCategoryBoundaries(
  windowPeriods: CategoryWindowPeriod[],
  slots: AvailableSlot[],
): Slot[] {
  if (!windowPeriods.length || !slots.length) return slots;
  return slots.flatMap((slot) =>
    splitOneSlot(slot, findPeriodsForSlot(slot, windowPeriods)),
  );
}
