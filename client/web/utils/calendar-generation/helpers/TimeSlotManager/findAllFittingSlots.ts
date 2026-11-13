import { PlaceableSlot, Slot } from "../../models/TimeSlot";
import { dateTimeService } from "../../utils/dateTimeService";
import {
  AllowedTimesSettings,
  intersectIntervalWithAllowed,
} from "../../../allowedTimes";

// Find slots a task could be placed in, given duration + buffer.
//
// Category membership is now encoded directly on the slots:
//   - Constrained task (eligibleCategoryIds provided): only return CategorySlot
//     fragments whose categoryId is in the eligible set — the task's own
//     effective category plus any non-confined ancestor whose windows it may
//     cascade into (see buildCategoryEligibilityMap).
//   - Unconstrained task: skip CategorySlot fragments that are strict (those
//     belong to a category that excludes outsiders); free time and non-strict
//     categories are fair game.
//
// allowedTimes (per-task constraint chain, own + inherited) clips each
// candidate to the sub-intervals satisfying every settings object; one slot
// can yield several fragments. Fragments are copies with adjusted
// start/end/durationMinutes — the same virtual-candidate shape the afterDate
// clip already produces — so the whole placement unit lands inside the
// allowed window.
//
// placementWindowEnd is an optional upper bound on where a candidate may END
// (habit occurrences pass their period end). Slots starting at/after it are
// skipped (start-sorted, so we break); a candidate straddling it is clipped so
// the placement unit — task + trailing buffer/travel that selectBestSlot folds
// into its capacity check — cannot land past the window.
export function findAllFittingSlots(
  slots: Slot[],
  bufferTimeMinutes: number,
  durationMinutes: number,
  afterDate: Date,
  maxDaysToSearch?: number,
  eligibleCategoryIds?: Set<string>,
  placementCutoffDate?: Date | null,
  allowedTimes?: AllowedTimesSettings[],
  placementWindowEnd?: Date | null,
): PlaceableSlot[] {
  const fittingSlots: PlaceableSlot[] = [];
  // Omit maxDaysToSearch (the normal scheduling path does) to scan the whole
  // built fabric: horizon expansion grows it on demand until every placeable
  // item fits, and the placement cutoff (fabric tail) plus slot exhaustion bound
  // the scan. A fixed per-item day cap would re-introduce the bug where an item
  // can't see slots expansion has already materialized past the cap.
  const searchEndMs =
    maxDaysToSearch !== undefined
      ? dateTimeService.shiftDays(afterDate, maxDaysToSearch).getTime()
      : undefined;
  // Lenient pre-filter: slots need room for the task plus at minimum one
  // trailing buffer. The leading buffer may not be needed (when travel-
  // before is placed standalone in an earlier slot), so the precise
  // capacity check happens per-candidate in selectBestSlot.
  const baseRequiredMinutes = durationMinutes + bufferTimeMinutes;
  const cutoffMs = placementCutoffDate?.getTime();
  const windowEndMs = placementWindowEnd?.getTime();

  for (const slot of slots) {
    if (slot.type !== "available" && slot.type !== "category") continue;
    if (slot.end <= afterDate) continue;
    if (searchEndMs !== undefined && slot.start.getTime() >= searchEndMs) break;
    // Tail buffer: skip slots whose start is past the placement cutoff. The
    // cutoff is "(last placeable slot end) - PLACEMENT_BUFFER_DAYS", computed
    // per-iteration by scheduleTasksAndGoals.
    if (cutoffMs !== undefined && slot.start.getTime() >= cutoffMs) break;
    // Placement-window upper bound: a slot starting at/after the window end
    // can hold nothing for this candidate, and slots are start-sorted.
    if (windowEndMs !== undefined && slot.start.getTime() >= windowEndMs) break;

    if (eligibleCategoryIds) {
      if (
        slot.type !== "category" ||
        !eligibleCategoryIds.has(slot.categoryId)
      )
        continue;
    } else if (slot.type === "category" && slot.isStrictCategory) {
      continue;
    }

    const effectiveStart = slot.start < afterDate ? afterDate : slot.start;
    const slotEnd =
      windowEndMs !== undefined && slot.end.getTime() > windowEndMs
        ? placementWindowEnd!
        : slot.end;

    if (allowedTimes?.length) {
      const fragments = intersectIntervalWithAllowed(
        effectiveStart,
        slotEnd,
        allowedTimes,
      );
      for (const fragment of fragments) {
        const fragmentMinutes = dateTimeService.getMinutesDifference(
          fragment.start,
          fragment.end,
        );
        if (fragmentMinutes >= baseRequiredMinutes) {
          fittingSlots.push({
            ...slot,
            start: fragment.start,
            end: fragment.end,
            durationMinutes: fragmentMinutes,
          });
        }
      }
      continue;
    }

    const effectiveMinutes = dateTimeService.getMinutesDifference(
      effectiveStart,
      slotEnd,
    );

    if (effectiveMinutes >= baseRequiredMinutes) {
      fittingSlots.push({
        ...slot,
        start: effectiveStart,
        end: slotEnd,
        durationMinutes: effectiveMinutes,
      });
    }
  }

  return fittingSlots;
}
