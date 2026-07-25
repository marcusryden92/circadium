/**
 * Select Best Slot
 *
 * Scores valid slots using the strategy, calculates travel requirements,
 * and selects the best slot with enough capacity.
 */

import { Planner } from "@/types/prisma";
import { TimeSlotManager } from "../../core/TimeSlotManager";
import { TravelManager } from "../../core/TravelManager";
import { SchedulingStrategy } from "../../strategies/SchedulingStrategy";
import {
  ChunkSizing,
  SchedulingContext,
  SchedulingFailure,
  ScoredSlot,
  SlotSelectionResult,
} from "../../models/SchedulingModels";
import { PlaceableSlot } from "../../models/TimeSlot";
import { SchedulingFailureReason } from "../../constants";
import type { TravelShardSpan } from "../../utils/timeSlotUtils";
import { intersectIntervalWithAllowed } from "../../../allowedTimes";
import { SM } from "./schedulerMessages";

/**
 * Score time slots for a task using the strategy
 */
function scoreSlots(
  task: Planner,
  slots: PlaceableSlot[],
  strategy: SchedulingStrategy,
  context: SchedulingContext,
): ScoredSlot[] {
  const scored: ScoredSlot[] = slots.map((slot) => {
    const score = strategy.score(task, slot, context);

    return {
      slot: {
        start: slot.start,
        end: slot.end,
        durationMinutes: slot.durationMinutes,
      },
      source: slot,
      score,
      strategyScores: { [strategy.name]: score },
    };
  });

  // Sort by score (highest first), then by start time (earliest first) as tiebreaker
  return scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.slot.start.getTime() - b.slot.start.getTime();
  });
}

export function selectBestSlot(
  task: Planner,
  validSlots: PlaceableSlot[],
  taskLocationId: string | null | undefined,
  slotManager: TimeSlotManager,
  travelManager: TravelManager,
  strategy: SchedulingStrategy,
  context: SchedulingContext,
  sizing?: ChunkSizing,
  effectiveAfter?: Date,
): SlotSelectionResult | { failure: SchedulingFailure } {
  const recorder = context.schedulerRecorder;

  // Chunked placements fit-test at the chunk minimum; the actual reserved
  // duration is granted per-slot from its headroom after acceptance.
  const fitMinutes = sizing ? sizing.minMinutes : task.duration;

  // Absorb/reclaim back-extend the placement region before the candidate's
  // start. Removing the redundant travel is always correct (the user never
  // makes that trip); only the back-extension can violate the task's bounds.
  // So the slide is validated per candidate: the back-extended task start
  // must respect the lower placement bound (afterTime / earliest date) and
  // stay inside the same allowed interval as the candidate. When it doesn't,
  // the travel is still removed but the task keeps the candidate's clipped
  // start and the freed span stays free time (slideIntoFreedTravel=false).
  const constraints = context.plannerConstraintsMap?.get(task.id);
  const canSlideTaskTo = (slideTaskStart: Date, slotEnd: Date): boolean => {
    if (effectiveAfter && slideTaskStart < effectiveAfter) return false;
    const allowed = constraints?.allowedTimes;
    if (!allowed || allowed.length === 0) return true;
    const fragments = intersectIntervalWithAllowed(
      slideTaskStart,
      slotEnd,
      allowed,
    );
    return (
      fragments.length === 1 &&
      fragments[0].start.getTime() === slideTaskStart.getTime() &&
      fragments[0].end.getTime() === slotEnd.getTime()
    );
  };

  // Score ALL slots using the strategy (includes location adjacency scoring)
  const scoredSlots = scoreSlots(task, validSlots, strategy, context);

  recorder?.decision(SM.selectBestSlot.header(scoredSlots.length), 1);

  // Iterate through scored slots and find first one with enough capacity
  const bufferMinutes = slotManager.bufferTimeMinutes;

  let selectedSlot: PlaceableSlot | null = null;
  let travelBefore = 0;
  let travelAfter = 0;
  let selectedReusableTravelStart: Date | null = null;
  let selectedAbsorbableTravel: TravelShardSpan | null = null;
  let selectedReclaimPrecedingGapTravel: TravelShardSpan | null = null;
  let selectedRemovableFollowingInbound: TravelShardSpan | null = null;
  let selectedSlideIntoFreedTravel = true;
  let selectedGrantedMinutes = task.duration;

  let candidateIdx = 0;
  for (const scoredSlot of scoredSlots) {
    candidateIdx += 1;
    const slot = scoredSlot.source;

    recorder?.noteSlotInRange(slot);
    recorder?.decision(
      SM.selectBestSlot.candidateHeader(
        candidateIdx,
        recorder.label(slot),
        scoredSlot.score,
      ),
      2,
    );

    // A day whose split budget can't host even a minimum chunk is off-limits
    // before any travel math.
    if (sizing?.dayBudget && sizing.dayBudget(slot.start) < sizing.minMinutes) {
      recorder?.decision(SM.selectBestSlot.dayBudgetExhausted, 3);
      continue;
    }

    // Calculate travel times based on location
    // Null-location tasks ("everywhere") don't need travel - they're transparent
    let needTravelBefore = 0;
    let needTravelAfter = 0;

    let canAbsorbPrevTravel = false;
    let absorbableTravel: TravelShardSpan | null = null;
    let reclaimPrecedingGapTravel: TravelShardSpan | null = null;
    let removableFollowingInbound: TravelShardSpan | null = null;
    let slideIntoFreedTravel = true;

    // For a CategorySlot, the task lands inside the category interior, so
    // the user's effective location on both sides of the task is the
    // category's currentLocationId. Entry/exit of the category itself is
    // handled separately at the slot's edges.
    const slotPrevLoc =
      slot.type === "category" ? slot.currentLocationId : slot.prevLocationId;
    const slotNextLoc =
      slot.type === "category" ? slot.currentLocationId : slot.nextLocationId;

    if (recorder) {
      recorder.decision(
        SM.selectBestSlot.locationsSnapshot(
          recorder.locName(slotPrevLoc),
          recorder.locName(slotNextLoc),
          recorder.locName(taskLocationId),
        ),
        3,
      );
    }

    if (taskLocationId) {
      // Travel BEFORE: needed if prev location differs from task location
      if (slotPrevLoc && slotPrevLoc !== taskLocationId) {
        // Check if the prev location is actually a travel destination from a previous
        // task at OUR location. e.g., B4 (Uppsala) placed travel-after Uppsala->GamlaStan,
        // so the free slot has prevLocationId=GamlaStan. If B5 is also Uppsala, we can
        // absorb B4's travel-after instead of creating new travel-before.
        absorbableTravel = travelManager.findAdjacentTravelFrom(
          slot.start,
          taskLocationId,
        );
        if (absorbableTravel) {
          canAbsorbPrevTravel = true;
          needTravelBefore = 0;
          slideIntoFreedTravel = canSlideTaskTo(
            new Date(
              absorbableTravel.travelStart.getTime() + bufferMinutes * 60000,
            ),
            slot.end,
          );
          if (recorder) {
            const dur = Math.floor(
              (absorbableTravel.travelEnd.getTime() -
                absorbableTravel.travelStart.getTime()) /
                60000,
            );
            recorder.decision(
              SM.selectBestSlot.absorbPrevTravelAfter(
                recorder.locName(absorbableTravel.travelFromLocationId),
                recorder.fmtDate(absorbableTravel.travelStart),
                recorder.fmtDate(absorbableTravel.travelEnd),
                dur,
              ),
              3,
            );
            if (!slideIntoFreedTravel) {
              recorder.decision(SM.selectBestSlot.absorbWithoutSlide, 3);
            }
          }
        } else {
          // Check if there is a pre-carved gap travel immediately before this
          // slot. Two reclaimable shapes:
          //  - origin ≠ task location (e.g. a return trip Gamla Stan → Home):
          //    bypass the intermediate stop, travel direct from the real
          //    origin to the task location.
          //  - origin === task location (e.g. the Work → Home return leg the
          //    static pass carves after a Work plan): the leg leaves from where
          //    we already are. Staying put needs no travel at all — remove the
          //    leg, occupy the freed span, and let the return trip re-derive
          //    after the task. Without this the fallback below adds a fresh
          //    Home → Work inbound, stranding a pointless Work → Home → Work.
          const precedingGapTravel = travelManager.findPrecedingGapTravel(
            slot.start,
          );
          const gapOrigin = precedingGapTravel?.travelFromLocationId;
          if (gapOrigin) {
            const stayingPut = gapOrigin === taskLocationId;
            const directTravel = stayingPut
              ? 0
              : travelManager.getTravelTime(
                  gapOrigin,
                  taskLocationId,
                  precedingGapTravel.travelStart,
                );
            // origin ≠ taskLocation returning 0 means the matrix had no route —
            // not reclaimable. Staying put is a genuine zero-travel reclaim.
            if (directTravel > 0 || stayingPut) {
              needTravelBefore = directTravel;
              reclaimPrecedingGapTravel = precedingGapTravel;
              // Mirror reserveTaskSlot's layout: a standalone-outside
              // travel-before puts the slid task at the span start; travel
              // inside prepends buffer + travel; staying put (no travel-before)
              // prepends only the leading buffer.
              const slideOffsetMinutes = stayingPut
                ? bufferMinutes
                : travelManager.canPlaceStandaloneTravelBefore(
                      new Date(slot.start.getTime()),
                      directTravel,
                    )
                  ? 0
                  : bufferMinutes + directTravel;
              slideIntoFreedTravel = canSlideTaskTo(
                new Date(
                  precedingGapTravel.travelStart.getTime() +
                    slideOffsetMinutes * 60000,
                ),
                slot.end,
              );
              if (!slideIntoFreedTravel) {
                recorder?.decision(SM.selectBestSlot.absorbWithoutSlide, 3);
              }
              if (recorder) {
                const dur = Math.floor(
                  (precedingGapTravel.travelEnd.getTime() -
                    precedingGapTravel.travelStart.getTime()) /
                    60000,
                );
                recorder.decision(
                  SM.selectBestSlot.reclaimPrecedingGapTravel(
                    recorder.locName(gapOrigin),
                    directTravel,
                    recorder.fmtDate(precedingGapTravel.travelStart),
                    recorder.fmtDate(precedingGapTravel.travelEnd),
                    dur,
                  ),
                  3,
                );
              }
            }
          }

          if (!reclaimPrecedingGapTravel) {
            needTravelBefore = travelManager.getTravelTime(
              slotPrevLoc,
              taskLocationId,
              slot.start,
            );
            recorder?.decision(
              SM.selectBestSlot.travelBeforeRequired(
                recorder.locName(slotPrevLoc),
                recorder.locName(taskLocationId),
                needTravelBefore,
              ),
              3,
            );
          }
        }
      } else if (taskLocationId) {
        recorder?.decision(SM.selectBestSlot.travelBeforeNotNeeded, 3);
      }

      // Travel AFTER: needed if next location differs from task location.
      // Look up at the departure time (after travel-before + the task), not
      // slot.start — a long task can cross into a different rush-hour bucket,
      // and the reservation path prices the leg at its actual position.
      if (slotNextLoc && slotNextLoc !== taskLocationId) {
        // The slot's nextLocation can be a phantom: a same-location task placed
        // later in the schedule but earlier in time leaves its inbound travel
        // right after this slot, and the free fragment inherited that leg's
        // ORIGIN as nextLocationId (reserveStandaloneTravelBefore). Travelling
        // there and straight back is the redundant round trip. If the leg
        // abutting the slot end is an inbound to OUR location whose origin is
        // exactly this phantom, the next placement is at taskLocationId: emit
        // no travel-after and remove that inbound at reservation.
        const followingInbound = travelManager.findAdjacentTravelTo(
          slot.end,
          taskLocationId,
        );
        if (
          followingInbound &&
          followingInbound.travelStart.getTime() >= slot.end.getTime() &&
          followingInbound.travelFromLocationId === slotNextLoc
        ) {
          removableFollowingInbound = followingInbound;
          needTravelAfter = 0;
          recorder?.decision(
            SM.selectBestSlot.dropRedundantFollowingInbound(
              recorder.locName(slotNextLoc),
              recorder.locName(taskLocationId),
            ),
            3,
          );
        } else {
          const travelAfterDeparture = new Date(
            slot.start.getTime() +
              (needTravelBefore + fitMinutes) * 60 * 1000,
          );
          needTravelAfter = travelManager.getTravelTime(
            taskLocationId,
            slotNextLoc,
            travelAfterDeparture,
          );
          recorder?.decision(
            SM.selectBestSlot.travelAfterRequired(
              recorder.locName(taskLocationId),
              recorder.locName(slotNextLoc),
              needTravelAfter,
            ),
            3,
          );
        }
      } else if (taskLocationId && slotNextLoc) {
        recorder?.decision(SM.selectBestSlot.travelAfterNotNeeded, 3);
      }
    }

    // Calculate required inside-slot time.
    // Layout: [leading buffer] [travel-before] [task] [travel-after] [trailing buffer]
    // Travel is flush with its owning task. A buffer separates the unit
    // from both slot boundaries; between two consecutive placements in the
    // same slot only the second unit's leading buffer applies, so the gap
    // is exactly one bufferMs.

    // Check if existing travel to the destination can be reused
    let effectiveTravelAfter = needTravelAfter;
    let reusableTravelStart: Date | null = null;

    if (needTravelAfter > 0 && slotNextLoc) {
      const reusableTravelSpan = travelManager.findAdjacentTravelTo(
        slot.end,
        slotNextLoc,
      );
      if (reusableTravelSpan) {
        // Use the SPAN's start, not the single shard's — the freed-up
        // region's downstream computation needs the logical travel's
        // true start.
        reusableTravelStart = reusableTravelSpan.travelStart;
        effectiveTravelAfter = 0;
        recorder?.decision(
          SM.selectBestSlot.travelAfterReusable(
            recorder.fmtDate(reusableTravelSpan.travelStart),
            needTravelAfter,
          ),
          3,
        );
      }
    }

    let canPlaceTravelOutside = false;
    // Baseline: task + travel-after + trailing buffer. Leading buffer is
    // added below unless travel-before is placed standalone (in which case
    // the standalone travel's end provides the leading boundary, so no
    // extra buffer at this slot's level).
    let requiredInside =
      fitMinutes +
      (effectiveTravelAfter > 0 ? effectiveTravelAfter : 0) +
      bufferMinutes;

    if (needTravelBefore > 0 && slotPrevLoc && taskLocationId) {
      const travelEnd = new Date(slot.start.getTime());
      canPlaceTravelOutside = travelManager.canPlaceStandaloneTravelBefore(
        travelEnd,
        needTravelBefore,
      );
      if (!canPlaceTravelOutside) {
        // Travel inside the slot, flush with task: buffer goes BEFORE travel.
        requiredInside += bufferMinutes + needTravelBefore;
        recorder?.decision(
          SM.selectBestSlot.travelBeforeInsideRequired(needTravelBefore),
          3,
        );
      } else {
        recorder?.decision(
          SM.selectBestSlot.travelBeforeOutsideOK(needTravelBefore),
          3,
        );
      }
    } else {
      // No travel-before: task is the leading thing; apply leading buffer.
      requiredInside += bufferMinutes;
    }

    // When absorbing a previous task's travel-after, or reclaiming a preceding gap travel,
    // the reclaimed travel space adds to the effective slot capacity. Use the
    // full multi-shard span duration (travelEnd - travelStart) so we count
    // every shard, not just the matched one. Without the slide the task cannot
    // occupy the freed span, so no capacity bonus applies.
    let effectiveCapacity = slot.durationMinutes;
    if (slideIntoFreedTravel && canAbsorbPrevTravel && absorbableTravel) {
      const spanDur = Math.floor(
        (absorbableTravel.travelEnd.getTime() -
          absorbableTravel.travelStart.getTime()) /
          60000,
      );
      effectiveCapacity += spanDur;
    } else if (slideIntoFreedTravel && reclaimPrecedingGapTravel) {
      // Expand capacity backward to include the gap travel window.
      const spanDur = Math.floor(
        (reclaimPrecedingGapTravel.travelEnd.getTime() -
          reclaimPrecedingGapTravel.travelStart.getTime()) /
          60000,
      );
      effectiveCapacity += spanDur;
    }

    // Check if this slot has enough capacity
    if (effectiveCapacity >= requiredInside) {
      recorder?.decision(
        SM.selectBestSlot.capacityOK(effectiveCapacity, requiredInside),
        3,
      );

      let grantedMinutes = task.duration;
      let grantedTravelAfter = effectiveTravelAfter;

      if (sizing) {
        const dayBudgetMinutes = sizing.dayBudget
          ? sizing.dayBudget(slot.start)
          : Infinity;
        // Everything in requiredInside except the task minutes themselves —
        // buffers plus any travel placed inside the slot.
        const overhead = requiredInside - fitMinutes;
        let headroom = effectiveCapacity - overhead;
        grantedMinutes = sizing.grant(headroom, dayBudgetMinutes);
        if (grantedMinutes <= 0) {
          recorder?.decision(SM.selectBestSlot.chunkGrantRejected, 3);
          continue;
        }

        // Travel-after was priced at the minimum-size departure; a grown
        // chunk departs later and can cross into a different rush-hour
        // bucket. Re-quote at the granted departure and shrink the grant if
        // the new price eats the headroom; converges because travel prices
        // are step functions of the departure bucket.
        if (grantedTravelAfter > 0 && slotNextLoc && taskLocationId) {
          for (let i = 0; i < 3 && grantedMinutes > 0; i++) {
            const departure = new Date(
              slot.start.getTime() +
                (needTravelBefore + grantedMinutes) * 60 * 1000,
            );
            const requote = travelManager.getTravelTime(
              taskLocationId,
              slotNextLoc,
              departure,
            );
            if (requote <= grantedTravelAfter) break;
            headroom -= requote - grantedTravelAfter;
            grantedTravelAfter = requote;
            grantedMinutes = sizing.grant(headroom, dayBudgetMinutes);
          }
          if (grantedMinutes <= 0) {
            recorder?.decision(SM.selectBestSlot.chunkGrantRejected, 3);
            continue;
          }
        }
      }

      selectedSlot = slot;
      travelBefore = needTravelBefore;
      travelAfter = grantedTravelAfter;
      selectedReusableTravelStart = reusableTravelStart;
      selectedAbsorbableTravel = canAbsorbPrevTravel ? absorbableTravel : null;
      selectedReclaimPrecedingGapTravel = reclaimPrecedingGapTravel;
      selectedRemovableFollowingInbound = removableFollowingInbound;
      selectedSlideIntoFreedTravel = slideIntoFreedTravel;
      selectedGrantedMinutes = grantedMinutes;
      break;
    }
    recorder?.decision(
      SM.selectBestSlot.capacityInsufficient(effectiveCapacity, requiredInside),
      3,
    );
  }

  if (!selectedSlot) {
    recorder?.decision(SM.selectBestSlot.noSlotSelected, 1);
    return {
      failure: {
        taskId: task.id,
        taskTitle: task.title,
        reason: SchedulingFailureReason.NO_SLOTS,
        details: "No slots found with enough capacity for task + travel",
      },
    };
  }

  return {
    selectedSlot,
    travelBefore,
    travelAfter,
    reusableTravelStart: selectedReusableTravelStart,
    taskLocationId,
    absorbableTravel: selectedAbsorbableTravel,
    reclaimPrecedingGapTravel: selectedReclaimPrecedingGapTravel,
    removableFollowingInbound: selectedRemovableFollowingInbound,
    slideIntoFreedTravel: selectedSlideIntoFreedTravel,
    grantedDurationMinutes: selectedGrantedMinutes,
  };
}
