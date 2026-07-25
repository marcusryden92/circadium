/**
 * schedulerMessages
 *
 * Phrasebook for the per-task decision/action strings emitted by the
 * dynamic scheduling pass. Mirrors the travelPassMessages pattern from
 * staticEventTravelPass.
 */

export const SM = {
  scheduleTask: {
    begin: (
      title: string,
      duration: number,
      location: string,
      categoryConstraint: string,
    ) =>
      `Scheduling task "${title}" (${duration}min, location=${location}, category=${categoryConstraint})`,
    validationFailed: (reason: string) => `Validation failed: ${reason}`,
    success: (start: string, end: string) =>
      `Scheduled at ${start}-${end}`,
    failure: (reason: string, details: string) =>
      `Failed: ${reason} — ${details}`,
  },

  findValidSlots: {
    noFittingSlots: (duration: number) =>
      `No fitting slots for ${duration}min`,
    foundFittingSlots: (count: number) =>
      `Found ${count} fitting slot(s)`,
  },

  selectBestSlot: {
    header: (count: number) => `Evaluating ${count} candidate slot(s):`,
    candidateHeader: (
      idx: number,
      label: string,
      score: number,
    ) =>
      `Candidate #${idx} ${label} (score=${score.toFixed(3)})`,
    locationsSnapshot: (
      prevLoc: string,
      nextLoc: string,
      taskLoc: string,
    ) =>
      `slot prev=${prevLoc}, next=${nextLoc}, task=${taskLoc}`,
    travelBeforeNotNeeded: "No travel-before needed (prev == task location)",
    travelAfterNotNeeded: "No travel-after needed (next == task location)",
    dayBudgetExhausted:
      "Skipped: split day budget below the minimum chunk for this day",
    chunkGrantRejected:
      "Skipped: no valid chunk size for this slot's headroom/day budget",
    absorbPrevTravelAfter: (
      spanFrom: string,
      spanStart: string,
      spanEnd: string,
      spanDur: number,
    ) =>
      `Absorb prev task's outbound travel: ${spanFrom} span [${spanStart}-${spanEnd}, ${spanDur}min] — no travel-before needed`,
    absorbWithoutSlide:
      "Back-extension would cross a placement bound (allowed times / earliest start / chain) — travel still removed, task keeps the clipped slot start, freed span stays free time",
    reclaimPrecedingGapTravel: (
      origin: string,
      directT: number,
      spanStart: string,
      spanEnd: string,
      spanDur: number,
    ) =>
      `Reclaim preceding gap travel from ${origin} (direct ${directT}min): span [${spanStart}-${spanEnd}, ${spanDur}min]`,
    travelBeforeRequired: (prevLoc: string, taskLoc: string, T: number) =>
      `Travel-before required ${prevLoc}→${taskLoc} = ${T}min`,
    travelAfterRequired: (taskLoc: string, nextLoc: string, T: number) =>
      `Travel-after required ${taskLoc}→${nextLoc} = ${T}min`,
    dropRedundantFollowingInbound: (phantomLoc: string, taskLoc: string) =>
      `Next placement is at ${taskLoc}; slot's next=${phantomLoc} is only the origin of a following inbound to ${taskLoc}. No travel-after; that inbound is removed (collapses the round trip)`,
    travelAfterReusable: (spanStart: string, T: number) =>
      `Travel-after reuses existing inbound span starting at ${spanStart} (saves ${T}min inside slot)`,
    travelBeforeOutsideOK: (T: number) =>
      `Travel-before (${T}min) can be placed OUTSIDE slot (no inside cost)`,
    travelBeforeInsideRequired: (T: number) =>
      `Travel-before (${T}min) must be placed INSIDE slot`,
    capacityCheck: (effectiveCapacity: number, requiredInside: number) =>
      `Capacity: effective=${effectiveCapacity}min, required=${requiredInside}min`,
    capacityInsufficient: (effectiveCapacity: number, requiredInside: number) =>
      `Capacity insufficient (${effectiveCapacity} < ${requiredInside}) — skip`,
    capacityOK: (effectiveCapacity: number, requiredInside: number) =>
      `Capacity OK (${effectiveCapacity} ≥ ${requiredInside}) — selected`,
    noSlotSelected: "No candidate had enough capacity",
  },

  reserveTaskSlot: {
    layout: (
      taskStart: string,
      taskEnd: string,
      offsetMin: number,
      slotStart: string,
    ) =>
      `Task placement: [${taskStart}-${taskEnd}] (offset +${offsetMin}min from effective slot start ${slotStart})`,
    standaloneTravelBeforePlaced: (
      prevLoc: string,
      taskLoc: string,
      T: number,
    ) =>
      `Placed standalone travel-before ${prevLoc}→${taskLoc} = ${T}min OUTSIDE slot`,
    standaloneTravelBeforeFailed:
      "Standalone travel-before placement failed — falling back to inside-slot travel",
  },

  reserveSlotWithTravel: {
    absorbPrevTravelAfter: (
      travelId: string,
      spanStart: string,
      spanEnd: string,
    ) =>
      `Absorbed prev task's travel-after (travelId=${travelId.slice(0, 8)}, span [${spanStart}-${spanEnd}]); extended Available start back to span start`,
    reclaimGapTravel: (
      travelId: string,
      spanStart: string,
      spanEnd: string,
    ) =>
      `Reclaimed preceding gap travel (travelId=${travelId.slice(0, 8)}, span [${spanStart}-${spanEnd}]); extended Available start back to span start`,
    removedInboundTravel: (
      travelId: string,
      spanStart: string,
      spanEnd: string,
    ) =>
      `Removed pre-existing inbound travel (travelId=${travelId.slice(0, 8)}, span [${spanStart}-${spanEnd}]) before placing new inbound`,
    placedInboundTravel: (
      prevLoc: string,
      taskLoc: string,
      start: string,
      end: string,
    ) =>
      `Placed inbound travel ${prevLoc}→${taskLoc} [${start}-${end}]`,
    placedOccupied: (start: string, end: string) =>
      `Placed Occupied(task) [${start}-${end}]`,
    reclaimedTrailingTravel: (
      travelId: string,
      spanStart: string,
      spanEnd: string,
    ) =>
      `Reclaimed trailing preliminary travel (travelId=${travelId.slice(0, 8)}, span [${spanStart}-${spanEnd}])`,
    removedOutboundTravel: (
      travelId: string,
      spanStart: string,
      spanEnd: string,
    ) =>
      `Removed pre-existing outbound travel (travelId=${travelId.slice(0, 8)}, span [${spanStart}-${spanEnd}]) before placing new outbound`,
    placedOutboundTravel: (
      taskLoc: string,
      nextLoc: string,
      start: string,
      end: string,
    ) =>
      `Placed outbound travel ${taskLoc}→${nextLoc} [${start}-${end}]`,
    placedFreeLeftover: (start: string, end: string, prevLoc: string) =>
      `Placed free Available leftover [${start}-${end}, prev=${prevLoc}]`,
    placedHeadLeftover: (start: string, end: string) =>
      `Placed leading Available leftover [${start}-${end}]`,
    splitSlotFailed:
      "Failed to locate the chosen slot in availableSlots — splice aborted",
  },
} as const;
