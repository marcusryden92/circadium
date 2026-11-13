// Tracks unmatched outbound legs to detect return trips.
//
// Two return shapes are detected:
//
//   STRICT RETURN — exact mirror: an open leg A→B is consumed when B→A
//   happens. Covers the simple round trip A → B → A.
//
//   CHAINED RETURN — destination matches the source of an open leg: when
//   X→A happens and some open leg starts at A (we visited A earlier and
//   went elsewhere from there), treat this as a return and consume A's
//   leg plus everything that opened after it. Covers multi-hop trips:
//   A → B → C → A, where the return-to-A has no exact A→? mirror but A
//   is still where we started.
export function createLegTracker() {
  let openLegs: { from: string; to: string }[] = [];

  // Returns true if this trip is a return, false if new outbound.
  function track(from: string, to: string): boolean {
    const mirrorIdx = openLegs.findLastIndex(
      (t) => t.from === to && t.to === from,
    );
    if (mirrorIdx !== -1) {
      openLegs.splice(mirrorIdx, 1);
      return true;
    }

    const chainStartIdx = openLegs.findIndex((t) => t.from === to);
    if (chainStartIdx !== -1) {
      openLegs.splice(chainStartIdx);
      return true;
    }

    openLegs.push({ from, to });
    return false;
  }

  // Undo the most recent track(from, to) call. Used by the dispatcher
  // when absorbing a previously placed travel back into its adjacent
  // Available — the leg that track() opened needs to be removed so
  // future round-trip detection sees the correct history.
  //
  // Only undoes a leg that was OPENED (not consumed). If the original
  // track() consumed a leg (returned true), we can't perfectly restore
  // that state — the dispatcher shouldn't absorb a return-leg travel
  // (the absorb pattern only fires for outbound placements).
  function untrack(from: string, to: string): void {
    for (let i = openLegs.length - 1; i >= 0; i--) {
      if (openLegs[i].from === from && openLegs[i].to === to) {
        openLegs.splice(i, 1);
        return;
      }
    }
  }

  function reset() {
    openLegs = [];
  }

  return { track, untrack, reset };
}
