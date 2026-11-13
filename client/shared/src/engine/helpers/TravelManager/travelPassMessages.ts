/**
 * travelPassMessages
 *
 * Phrasebook for the decision/action strings emitted by staticEventTravelPass.
 * Centralising them here keeps the dispatch code readable and lets the log
 * vocabulary be tuned without touching the control flow. Each entry is either
 * a literal string or an arrow function that takes the interpolation args
 * needed at the call site.
 *
 * Organisation: one top-level key per source function in
 * staticEventTravelPass.ts. Within each, keys describe the decision branch or
 * action taken.
 */

export const M = {
  walker: {
    skipOccupiedOrTravel: (label: string) => `Current = ${label} → skip`,
  },

  handleAvailable: {
    outerGuardSkip: "Outer guard: prev == next — no transition, skip",
    outerGuardTransition: (travelMinutes: number) =>
      `Outer guard: transition prevLoc → nextLoc, travel = ${travelMinutes}min`,
    currentLargeEnough: (curDur: number, travelMinutes: number) =>
      `Current size (${curDur}min) ≥ travel (${travelMinutes}min) — place in current`,
    placeTravelInCurrentAction: (placeAtStart: boolean) =>
      `placeTravelInCurrent() (${placeAtStart ? "PlaceAtStart" : "PlaceAtEnd"})`,
    currentTooSmall: (curDur: number, travelMinutes: number) =>
      `Current size (${curDur}min) < travel (${travelMinutes}min) — too small`,
    nextIsTravelDecision:
      "Next = Travel (unexpected on forward walk) — untrack and skip",
    skipInconsistent: "skip (inconsistent state)",
    prevIsTravel: (travelIdx: number, label: string) =>
      `Prev = Travel at slots[${travelIdx}] (${label})`,
    nextAbsorbReplan: (nextType: string) =>
      `Next = ${nextType} — absorb prev travel and replan A→C`,
    prevSoft: (prevType: string) => `Prev = ${prevType} (soft predecessor)`,
    nextBleedAcross: (nextType: string) =>
      `Next = ${nextType} — bleed across prev/current/next`,
    bleedAcrossAction: "bleedAcrossPrevCurrentNext()",
    nextOccupiedBleedIntoPrev:
      "Next = Occupied — bleed into prev (may cascade backward)",
    prevOccupied: "Prev = Occupied (hard predecessor)",
    nextBleedIntoNext: (nextType: string) =>
      `Next = ${nextType} — bleed into next (may cascade forward)`,
    nextOccupiedFillCurrent: "Next = Occupied — fill current with alert",
    fillCurrentWithAlertAction: "fillCurrentWithAlert() (insufficientTravel)",
    unhandledCombination: "Unhandled prev/next combination — untrack and skip",
    skipUnhandled: "skip (unhandled case)",
  },

  handleCategory: {
    entryEdge: "Entry edge",
    exitEdge: "Exit edge",
  },

  handleCategoryEntryEdge: {
    outerGuardSkip: "Outer guard: prev == current — no transition, skip",
    noPrev: "No prev slot (i == 0) — skip",
    prevTravelEndsAtCurrent:
      "Prev = Travel ending at current location — already handled, skip",
    prevTravelUnexpectedDest:
      "Prev = Travel landing at unexpected location — skip",
    prevTravelMatchesPrevLoc:
      "Prev = Travel landing at slot.prevLocationId — fall through to placement",
    prevAvailableWithTravelAtPrevPrev: (prevPrevIdx: number) =>
      `Prev = Available with Travel at slots[${prevPrevIdx}] ending at current — already handled, skip`,
    prevAvailableNoMatchingTravel:
      "Prev = Available without matching Travel at slots[i-2] — skip",
    prevCategory:
      "Prev = Category — its exit edge handled the transition, skip",
    prevAnywhereOccupiedHandled: (lookbackIdx: number) =>
      `Prev = Anywhere Occupied(s); Travel at slots[${lookbackIdx}] already brought user to current — skip`,
    prevOccupiedFallThrough: "Prev = Occupied — fall through to placement",
    noActionFromResolve: "resolveCategoryEdge returned no action — skip",
    fitsAtHead: (curDur: number, travelMinutes: number) =>
      `Category size (${curDur}min) ≥ travel (${travelMinutes}min) — place at head`,
    placeAtHeadAction: "placeTravelAtCategoryHead()",
    bypassCascade: (curDur: number, travelMinutes: number) =>
      `Category size (${curDur}min) < travel (${travelMinutes}min) — bypass cascade`,
  },

  handleCategoryExitEdge: {
    outerGuardSkip: "Outer guard: current == next — no transition, skip",
    lastSlotFinal: "Last slot — mark isFinal",
    markFinalAction: "markCategoryFinal()",
    nextAvailableDeferred:
      "Next = Available — transition deferred to Available handler",
    nextCategoryBleedBoundary:
      "Next = Category — bleed across category boundary",
    noActionFromResolve: "resolveCategoryEdge returned no action — skip",
    nextOccupied: (label: string) => `Next = Occupied (${label})`,
    fitsAtTail: (curDur: number, travelMinutes: number) =>
      `Category size (${curDur}min) ≥ travel (${travelMinutes}min) — place at tail`,
    placeAtTailAction: "placeTravelAtCategoryTail()",
    prevTravelAbsorbReplan: (travelIdx: number, label: string) =>
      `Prev = Travel at slots[${travelIdx}] (${label}) — absorb + replan through category`,
    symmetricBleedFailsTryAbsorb: (
      half: number,
      curDur: number,
      travelIdx: number,
      label: string,
    ) =>
      `Symmetric bleed (${half}min) ≥ current cat (${curDur}min) — try backward absorb (prev Travel at slots[${travelIdx}] = ${label})`,
    symmetricBleedFailsForwardCascade: (half: number, curDur: number) =>
      `Symmetric bleed (${half}min) ≥ current cat (${curDur}min), no useful backward absorb — forward cascade`,
    symFailsTryBackwardCascade: (half: number, occupiedLabel: string) =>
      `Symmetric bleed (${half}min) ≥ a category, and ${occupiedLabel} sits past Cat2 at a different location — try backward cascade`,
    backwardCascadeFailed:
      "absorbAndReplanBackward() found no anchor — fall through to existing strategy",
    noPrevTravel: "No prev Travel — trespass the exit boundary",
    nextIsTravelDecision:
      "Next = Travel (unexpected on forward walk) — untrack and skip",
    skipInconsistent: "skip (inconsistent state)",
    unhandledNext: "Unhandled next type — skip",
  },

  bleedIntoPrev: {
    prevNotPlaceable: "Prev not placeable — fill current with alert",
    fillCurrentWithAlertAction: "fillCurrentWithAlert() (insufficientTravel)",
    overflowExceedsPrev: (overflow: number, prevDur: number) =>
      `Overflow (${overflow}min) > prev (${prevDur}min) — backward cascade`,
    actionConsumed: (label: string) =>
      `bleedIntoPrev(): fully consumed ${label} + filled current`,
    actionShortened: (label: string, consume: number) =>
      `bleedIntoPrev(): shortened ${label} by ${consume}min + filled current`,
  },

  bleedIntoNext: {
    nextNotPlaceable: "Next not placeable — fill current with alert",
    fillCurrentWithAlertAction: "fillCurrentWithAlert() (insufficientTravel)",
    overflowExceedsNext: (overflow: number, nextDur: number) =>
      `Overflow (${overflow}min) > next (${nextDur}min) — forward cascade`,
    actionConsumed: (label: string) =>
      `bleedIntoNext(): fully consumed ${label} + filled current`,
    actionShortened: (label: string, consume: number) =>
      `bleedIntoNext(): shortened ${label} by ${consume}min + filled current`,
  },

  trespassCategoryExit: {
    trespassEnd: (travelMinutes: number, curDur: number) =>
      `Travel (${travelMinutes}min) ≥ category (${curDur}min) — trespass at end instead of visible travel`,
    trespassEndAction: (label: string) => `mark trespassingEnd on ${label}`,
  },

  absorbAndReplan: {
    missingOrigin:
      "Prev travel origin missing — fallback to fillCurrentWithAlert()",
    fillCurrentWithAlertAction: "fillCurrentWithAlert()",
    noTravelTime:
      "A→C travel time unavailable — fallback to fillCurrentWithAlert()",
    forwardExtension: (
      regionMinutes: number,
      newDuration: number,
      slotType: string,
      extension: number,
    ) =>
      `Region (${regionMinutes}min) < travel (${newDuration}min) — extend into next ${slotType} at C by ${extension}min`,
    action: (absorbedLabels: string[], insufficient: boolean) =>
      `absorbAndReplan(): absorbed [${absorbedLabels.join(", ")}], placed new A→C travel${insufficient ? " (insufficient)" : ""}`,
  },

  absorbAndReplanThroughCategory: {
    missingOrigin:
      "Prev travel origin missing — fallback to trespassCategoryExit()",
    noTravelTime:
      "A→C travel time unavailable — fallback to trespassCategoryExit()",
    action: (absorbedLabels: string[], insufficient: boolean) =>
      `absorbAndReplanThroughCategory(): absorbed [${absorbedLabels.join(", ")}], placed new A→C travel through category${insufficient ? " (insufficient)" : ""}`,
  },

  absorbAndReplanIntoNextCategory: {
    header:
      "Cascade: absorbAndReplanIntoNextCategory() (current cat too small for symmetric bleed)",
    missingLocations:
      "Missing prev Travel origin — fallback to trespassCategoryExit()",
    noTravelTime:
      "A→destination travel time unavailable — fallback to trespassCategoryExit()",
    noCandidate:
      "No natural-fit or pre-fit candidate found — fall back to symmetric bleed",
    naturalFit: (idx: number, dest: string, T: number) =>
      `Chose natural-fit landing inside slots[${idx}] (A→${dest} = ${T}min, lands inside slot)`,
    preFit: (idx: number, dest: string, T: number, consumed: number) =>
      `Chose pre-fit at slots[${idx}] (A→${dest} = ${T}min ≤ consumed ${consumed}min)`,
    hardStop: (idx: number, dest: string, T: number) =>
      `Hit hard stop at slots[${idx}] (target ${dest}, A→${dest} = ${T}min)`,
    action: (
      absorbedLabels: string[],
      extendsIntoNext: boolean,
      insufficient: boolean,
    ) =>
      `absorbAndReplanIntoNextCategory(): absorbed [${absorbedLabels.join(", ")}], placed A→destination travel${extendsIntoNext ? " (bleeds into landing cat)" : " (overconstrained at landing.start)"}${insufficient ? " (insufficient)" : ""}`,
  },

  absorbAndReplanBackward: {
    header:
      "Cascade: absorbAndReplanBackward() (walking i, i-1, ..., destination = next-Occupied location)",
    committed: (
      idx: number,
      label: string,
      origin: string,
      T: number,
      kind: "naturalFit" | "preFit" | "overconstrained",
    ) =>
      `Chose ${kind} anchor at slots[${idx}] = ${label} (origin=${origin}, ${origin}→destination = ${T}min)`,
    action: (
      absorbedLabels: string[],
      anchorAbsorbed: boolean,
      overconstrained: boolean,
    ) =>
      `absorbAndReplanBackward(): absorbed [${absorbedLabels.join(", ")}], placed anchor→destination travel${anchorAbsorbed ? " (anchor absorbed)" : " (anchor preserved)"}${overconstrained ? " (overconstrained)" : ""}`,
  },

  bypassCategoryCascade: {
    header: "Cascade: bypassCategoryCascade() (forward, category entry)",
    noPinnedDestination:
      "No pinned destination found and no landing — fallback to trespassCategoryExit()",
    noTravelTime:
      "A→destination travel time unavailable — fallback to trespassCategoryExit()",
    anchorHardStop: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → hard stop`,
    retargetOccupied: (newT: number) =>
      `retarget to Occupied's location, travel=${newT}min`,
    skipAvailable: (idx: number) =>
      `anchor slots[${idx}] = Available → skip (transit, never a landing)`,
    evaluateCat: (idx: number, label: string, T: number) =>
      `anchor slots[${idx}] = ${label} → evaluate (A→candidate = ${T}min)`,
    endAtSlotStart: (T: number, consumed: number, idx: number) =>
      `preFit: T (${T}min) ≤ consumed (${consumed}min) — anchor slots[${idx}]`,
    partialSplit: (idx: number, remaining: number) =>
      `naturalFit inside slots[${idx}] — landing consumes ${remaining}min`,
    overshootSkip: (idx: number, T: number, slotDur: number) =>
      `T (${T}min) > consumed + slotDur (${slotDur}min) — overshoots, consume and continue`,
    action: (
      absorbedLabels: string[],
      insufficient: boolean,
      overconstrained: boolean,
    ) =>
      `bypassCategoryCascade(): absorbed [${absorbedLabels.join(", ")}], placed A→destination travel${insufficient ? " (insufficient)" : ""}${overconstrained ? " (overconstrained)" : ""}`,
  },

  // Shared anchor-walk vocabulary used by every backward cascade
  // (backwardBypassCascade, absorbAndReplanThroughCategory).
  cascadeWalk: {
    anchorHardStopOccupied: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → hard stop (location-pinned Occupied)`,
    anchorAnywherePassThrough: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → pass through (Anywhere)`,
    anchorTryAbsorbTravel: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → try absorb earlier Travel into direct A→C`,
    directFits: (TDirect: number, regionMinutes: number) =>
      `direct A→destination (${TDirect}min) fits in region (${regionMinutes}min) ✓`,
    directDoesNotFit: (TDirect: number, regionMinutes: number) =>
      `direct A→destination (${TDirect}min) > region (${regionMinutes}min) ✗`,
    extendIntoPrecedingAvailable: (extension: number, availableIdx: number) =>
      `extending into preceding Available at slots[${availableIdx}] by ${extension}min — fits naturally`,
    anchorAbortAvailable: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → abort cascade, fall back`,
    anchorCategoryMatches: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → location matches destination, skip`,
    anchorCategoryNoTravel: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → travel time unavailable, skip`,
    anchorCategoryFits: (
      idx: number,
      label: string,
      T: number,
      slotDuration: number,
    ) =>
      `anchor slots[${idx}] = ${label} → try anchor→destination (${T}min): span ${slotDuration}min ≥ ${T}min ✓ fits`,
    anchorCategoryDoesNotFit: (
      idx: number,
      label: string,
      T: number,
      slotDuration: number,
    ) =>
      `anchor slots[${idx}] = ${label} → span ${slotDuration}min < ${T}min ✗ skip`,
  },

  backwardBypassCascade: {
    header: "Cascade: backwardBypassCascade() (walking i-1, i-2, ...)",
    travelAbsorbAction: (absorbedLabels: string[]) =>
      `backwardBypassCascade() (Travel absorb): absorbed [${absorbedLabels.join(", ")}], placed merged A→destination travel`,
    fallbackPrevAction: "cascadeFallbackPrev() (insufficient)",
    action: (absorbedLabels: string[], overconstrained: boolean) =>
      `backwardBypassCascade(): absorbed [${absorbedLabels.join(", ")}], placed anchor→destination travel${overconstrained ? " (overconstrained)" : ""}`,
    noAnchorFits: "No anchor fit — fallback bleed into prev",
  },

  absorbAndReplanThroughCategoryCascade: {
    header: "Cascade: absorbAndReplanThroughCategory() (walking i-1, i-2, ...)",
    travelAbsorbAction: (absorbedLabels: string[]) =>
      `absorbAndReplanThroughCategory() (Travel absorb): absorbed [${absorbedLabels.join(", ")}], placed merged A→destination travel`,
    categoryAnchorAction: (
      absorbedLabels: string[],
      overconstrained: boolean,
    ) =>
      `absorbAndReplanThroughCategory() (Category anchor): absorbed [${absorbedLabels.join(", ")}], placed anchor→destination travel${overconstrained ? " (overconstrained)" : ""}`,
    noAnchorFits:
      "No anchor fit — fall back to 2-slot absorb with insufficient",
  },

  forwardBypassCascade: {
    header: "Cascade: forwardBypassCascade() (walking i+1, i+2, ...)",
    anchorHardStop: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → hard stop`,
    retargetOccupied: (newT: number) =>
      `retarget to Occupied's location, travel=${newT}min`,
    anchorAbortAvailable: (idx: number, label: string) =>
      `anchor slots[${idx}] = ${label} → abort cascade, fillCurrentWithAlert()`,
    fillCurrentWithAlertAction: "fillCurrentWithAlert() (insufficientTravel)",
    anchorRetarget: (idx: number, label: string, newT: number) =>
      `anchor slots[${idx}] = ${label} → retarget, travel=${newT}min`,
    endAtSlotStart: (T: number, consumed: number, idx: number) =>
      `preFit: T (${T}min) ≤ consumed (${consumed}min) — anchor slots[${idx}]`,
    partialSplit: (idx: number, remaining: number) =>
      `naturalFit inside slots[${idx}] — landing consumes ${remaining}min`,
    anchorConsume: (idx: number, label: string, slotDur: number) =>
      `anchor slots[${idx}] = ${label} → consume (${slotDur}min) and continue`,
    action: (
      absorbedLabels: string[],
      insufficient: boolean,
      overconstrained: boolean,
    ) =>
      `forwardBypassCascade(): absorbed [${absorbedLabels.join(", ")}], placed A→destination travel${insufficient ? " (insufficient)" : ""}${overconstrained ? " (overconstrained)" : ""}`,
  },

  bleedAcrossCategoryBoundary: {
    trespassBoundary: (half: number) =>
      `Symmetric bleed (${half}min each) ≥ a category — trespass boundary instead`,
    trespassAction: (currentLabel: string, nextLabel: string) =>
      `trespassed: [${currentLabel}.end, ${nextLabel}.start]`,
    action: (
      bleedCurrent: number,
      currentConsumed: boolean,
      currentLabel: string,
      nextConsumed: boolean,
      nextLabel: string,
    ) =>
      `bleedAcrossCategoryBoundary(): symmetric bleed ${bleedCurrent}min each side, ${currentConsumed ? `consumed ${currentLabel}` : "shortened current"}, ${nextConsumed ? `consumed ${nextLabel}` : "shortened next"}`,
  },
} as const;
