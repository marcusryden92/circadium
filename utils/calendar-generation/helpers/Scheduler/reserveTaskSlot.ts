/**
 * Reserve Task Slot
 *
 * Calculates task timing, places standalone travel-before if possible,
 * and reserves the slot with travel handling.
 */

import { Planner } from "@/types/prisma";
import { TimeSlotManager } from "../../core/TimeSlotManager";
import { TravelManager } from "../../core/TravelManager";
import {
  SchedulingContext,
  SchedulingFailure,
  ReservationResult,
} from "../../models/SchedulingModels";
import { PlaceableSlot } from "../../models/TimeSlot";
import { SchedulingFailureReason } from "../../constants";
import { dateTimeService } from "../../utils/dateTimeService";
import { reserveSlotWithTravel } from "../TimeSlotManager/reserveSlotWithTravel";
import type { TravelShardSpan } from "../../utils/timeSlotUtils";
import { SM } from "./schedulerMessages";

export function reserveTaskSlot(
  task: Planner,
  selectedSlot: PlaceableSlot,
  travelBefore: number,
  travelAfter: number,
  taskLocationId: string | null | undefined,
  reusableTravelStart: Date | null,
  slotManager: TimeSlotManager,
  travelManager: TravelManager,
  context: SchedulingContext,
  absorbableTravel: TravelShardSpan | null = null,
  reclaimPrecedingGapTravel: TravelShardSpan | null = null,
  slideIntoFreedTravel: boolean = true,
  durationMinutes?: number,
  removableFollowingInbound: TravelShardSpan | null = null,
  reroutableFollowingOutbound: TravelShardSpan | null = null,
): ReservationResult | { failure: SchedulingFailure } {
  const recorder = context.schedulerRecorder;
  const bufferMinutes = slotManager.bufferTimeMinutes;
  // Chunked placements reserve the granted size, not the row's full duration.
  const reservedMinutes = durationMinutes ?? task.duration;

  // For a CategorySlot, the task lands in the category interior — the user is
  // at currentLocationId on both sides of the task. (Category entry/exit
  // transitions live at the slot's edges and are handled separately.)
  const slotPrevLoc =
    selectedSlot.type === "category"
      ? selectedSlot.currentLocationId
      : selectedSlot.prevLocationId;
  const slotNextLoc =
    selectedSlot.type === "category"
      ? selectedSlot.currentLocationId
      : selectedSlot.nextLocationId;

  // When reclaiming a preceding gap travel (e.g. Gamla Stan → Home), use the gap
  // travel's real origin as prevLocationId so travel-before is routed correctly.
  const effectivePrevLocationId = reclaimPrecedingGapTravel
    ? (reclaimPrecedingGapTravel.travelFromLocationId ?? slotPrevLoc ?? null)
    : (slotPrevLoc ?? null);

  // When rerouting a following outbound leg, travel-after goes direct to the
  // leg's DESTINATION — the slot's boundary location was only the leg's stale
  // origin.
  const effectiveNextLocationId = reroutableFollowingOutbound
    ? (reroutableFollowingOutbound.travelToLocationId ?? slotNextLoc ?? null)
    : (slotNextLoc ?? null);

  // Calculate task times.
  // Layouts:
  //   travel inside:  [slot.start] [leading buf] [travel-before] [task] [travel-after] [trailing buf] [slot.end]
  //   travel outside: [...earlier slot...travel-before][slot.start = task] [travel-after] [trailing buf] [slot.end]
  //   no travel:      [slot.start] [leading buf] [task] [trailing buf] [slot.end]
  // Travel is flush with the task. The leading buffer only applies at this
  // slot's level when travel-before is NOT placed standalone — otherwise
  // the standalone travel's end provides the leading boundary, and the
  // task lands flush with it.

  let offsetToTaskStart = bufferMinutes;
  let effectiveTravelBefore = travelBefore;

  if (travelBefore > 0) {
    // travelEnd = slot.start = eventEnd (standalone travel ends here)
    const travelEnd = new Date(selectedSlot.start.getTime());
    const canPlaceOutside = travelManager.canPlaceStandaloneTravelBefore(
      travelEnd,
      travelBefore,
    );
    offsetToTaskStart = canPlaceOutside ? 0 : bufferMinutes + travelBefore;
  }

  // When absorbing the previous task's travel-after, or reclaiming a preceding
  // gap travel, start at the absorbed/reclaimed position instead of the free
  // slot's nominal start (the slot will be back-extended in reserveSlotWithTravel).
  // Without the slide the redundant travel is still removed, but the task keeps
  // the candidate slot's clipped start and the freed span stays free time.
  const effectiveSlotStart = slideIntoFreedTravel
    ? (absorbableTravel?.travelStart ??
      reclaimPrecedingGapTravel?.travelStart ??
      selectedSlot.start)
    : selectedSlot.start;

  const taskStartDate = dateTimeService.addDuration(
    effectiveSlotStart,
    offsetToTaskStart,
  );
  const taskEndDate = dateTimeService.addDuration(
    taskStartDate,
    reservedMinutes,
  );

  recorder?.decision(
    SM.reserveTaskSlot.layout(
      recorder.fmtDate(taskStartDate),
      recorder.fmtDate(taskEndDate),
      offsetToTaskStart,
      recorder.fmtDate(effectiveSlotStart),
    ),
    1,
  );

  // Reserve the slot with travel placement.
  // If placing travel-before outside, reserve it separately and omit travel-before inside.
  if (effectiveTravelBefore > 0 && effectivePrevLocationId && taskLocationId) {
    const travelEnd = new Date(selectedSlot.start.getTime());
    const placed = travelManager.reserveStandaloneTravelBefore(
      travelEnd,
      effectiveTravelBefore,
      effectivePrevLocationId,
      taskLocationId,
    );
    if (placed.success) {
      // Travel-before placed outside; do not include it inside reserveSlotWithTravel
      effectiveTravelBefore = 0;
      recorder?.action(
        SM.reserveTaskSlot.standaloneTravelBeforePlaced(
          recorder.locName(effectivePrevLocationId),
          recorder.locName(taskLocationId),
          travelBefore,
        ),
      );
    } else {
      recorder?.decision(
        SM.reserveTaskSlot.standaloneTravelBeforeFailed,
        2,
      );
    }
    // Fallback handled by offsetToTaskStart above (travel placed inside the slot)
  }

  const result = reserveSlotWithTravel(
    slotManager.slots,
    slotManager.bufferTimeMinutes,
    taskStartDate,
    taskEndDate,
    task.id,
    task.plannerType,
    taskLocationId ?? null,
    effectiveTravelBefore,
    travelAfter,
    effectivePrevLocationId,
    effectiveNextLocationId,
    reusableTravelStart,
    absorbableTravel,
    reclaimPrecedingGapTravel,
    recorder,
    removableFollowingInbound,
    reroutableFollowingOutbound,
  );

  if (!result.success) {
    return {
      failure: {
        taskId: task.id,
        taskTitle: task.title,
        reason: SchedulingFailureReason.NO_SLOTS,
        details: "Failed to reserve slot (may have been taken)",
      },
    };
  }

  return { taskStartDate, taskEndDate };
}
