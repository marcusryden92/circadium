# Hand-off: Scheduling Quality Improvements
 
**Target:** `utils/calendar-generation/` engine
**Goal:** measurable placement-quality gains without introducing a constraint solver. Every change here is O(1) or bounded-linear per leaf; nothing iterates to a fixpoint.
 
---
 
## 0. Read this first
 
**Provenance.** This plan was derived from the engine design doc (`docs/calendar-generation.md`), not from reading source. Every numeric claim below is marked either **[verified-in-doc]** or **[assumed — verify]**. Before implementing any task, confirm the current values in the actual files. If reality differs from what's stated here, **stop and report the discrepancy** rather than adapting the plan silently — the sequencing depends on the diagnosis being right.
 
**Non-negotiable invariants.** Do not violate these while implementing:
 
- The slot array (`TimeSlotManager.slots`) is the only source of truth for placement. Never introduce a parallel free-time cache.
- Travel manipulation is by `travelId` identity, never by time-window search.
- Strategies score only `PlaceableSlot` (`AvailableSlot | CategorySlot`), return `0.0–1.0`, and must remain pure and side-effect free.
- Urgency is **not** a strategy. It is computed once in `scoreCandidatesAndRootGoals` and consumed by sorting. Do not move deadline logic into slot scoring.
- Determinism: same inputs must produce the same output. Any new ordering must be total (no ties resolved by array position or `Map` iteration order).
- Stable regen: an unchanged placement must diff as a no-op. Preserve the `stabilizeEvent` path.
**Commit discipline.** One task per commit, in the order given. Tasks 1 and 2 change placements globally on first regen — they must not share a commit with anything else, or you won't be able to distinguish intentional movement from a regression.
 
---
 
## 1. Make the travel penalty proportional
 
**Files:** `strategies/LocationGroupingStrategy.ts`, `strategies/defaultStrategy.ts`
 
### Diagnosis
 
With defaults `earliestSlot: 1.0`, `locationGrouping: 0.2` **[verified-in-doc]**, the composite is a weighted mean over weights summing to 1.2. Therefore:
 
| Signal | Composite impact |
| --- | --- |
| One day earlier (EarliestSlot, `1/14` per day) | ≈ 0.060 |
| Max travel penalty (`maxSingleTravelPenalty: 0.02`) | ≈ 0.0033 |
| Sandwich spread (`bothMatch 0.95` → `neitherMatch 0.4`) | ≈ 0.092 |
 
Two problems:
 
1. The entire travel penalty is worth ~1.3 hours of earliness. It cannot change any decision.
2. It **saturates**: with `singleTravelPenaltyDivisor: 600` and cap `0.02`, the penalty maxes out at 12 minutes of travel. A 15-minute commute and a 2-hour commute score *identically*. The model registers *whether* locations match, never *how far apart* they are.
This matters more than a normal scoring weight because travel is materialized as real occupied minutes in the slot array — mis-scored travel is calendar capacity actually spent.
 
### Change
 
Replace the capped linear penalty with a proportional one:
 
```
travelRatio = travelMinutes / (travelMinutes + taskDurationMinutes)
penalty     = travelRatio * TRAVEL_PENALTY_SCALE
```
 
Properties this gives you, all of which are the point:
 
- A 90-min commute for a 30-min errand → ratio 0.75, heavily penalized.
- The same commute wrapping a full workday → ratio ~0.16, barely registers.
- Monotone in travel time with no saturation, so distance discriminates across the whole range.
Notes:
 
- `score()` currently receives `(task, slot, context)` — `task.duration` is available. **[assumed — verify]** For a chunked placement the relevant duration is the *chunk grant*, not the parent row's full duration. If the synthetic chunk clone carries the granted minutes, this is free; if it carries the parent duration, note it as a known inaccuracy and do **not** fix it in this commit.
- Clamp the final strategy output to `[0, 1]`. Penalty must never drive the score negative.
- Keep the double-travel case (both inbound and outbound legs) as a distinct, larger scale factor, mirroring today's single/double split.
- Set `TRAVEL_PENALTY_SCALE` so a ratio of 1.0 is worth roughly the full sandwich spread (~0.5 within-strategy). Start there; it's a tuning constant, not a derived one.
### Acceptance
 
- A task with two otherwise-equal candidate slots, one requiring 15 min of travel and one 120 min, must prefer the 15-min slot. **This currently fails** — write this test first and watch it fail before changing anything.
- Ratio-scaling behaves as above for short-task/long-task cases.
- Strategy output stays within `[0, 1]` for all inputs including zero-duration guards.
### Expected fallout
 
A large one-time diff on the first regen for every user. Snapshot and fixture-driven expectations in `__tests__/calendar-generation/` will move — in particular anything in `stable-regen.test.ts` or the trimmed live-data fixtures that asserts concrete placements. Update them deliberately, and in the commit message record which tests moved and why.
 
---
 
## 2. De-saturate the earliness curve
 
**File:** `strategies/EarliestSlotStrategy.ts`
 
### Diagnosis
 
`score = max(0, 1 - daysFromNow / 14)` **[verified-in-doc]** returns exactly `0.0` for every slot from day 14 to day 90 (`MAX_DAYS_TO_SEARCH`). Past two weeks the dominant strategy stops discriminating entirely; location grouping at weight 0.2 becomes the only live signal, and beyond that `selectBestSlot`'s "first slot that fits in descending score order" degenerates to array order. Anything placed into an expanded horizon is being positioned close to arbitrarily.
 
### Change
 
Swap for a curve that decays without ever reaching zero:
 
```
score = 1 / (1 + daysFromNow / 7)
```
 
Day 0 → 1.0, day 7 → 0.5, day 28 → 0.2, day 90 → ~0.072. Still O(1), still task-independent, still monotone — and it retains a usable gradient across the full search range.
 
The half-life constant (7) is the tuning knob. Larger = flatter = more willing to defer.
 
### Acceptance
 
- Strictly decreasing over `[0, MAX_DAYS_TO_SEARCH]`, never zero.
- Two slots 30 and 45 days out produce different scores (currently identical).
- Day 0 still scores 1.0.
---
 
## 3. EDF tier for deadline feasibility
 
**Files:** `helpers/PrioritySorter/sortByPriorityAndConstraints.ts`, `helpers/Scheduler/scheduleTasksAndGoals.ts`
 
### Diagnosis
 
Phase 12 emits `SCHEDULED_LATE` for events placed past an inherited deadline **[verified-in-doc]** — the scheduler places something late, detects it, and reports it rather than trying to avoid it. Deadlines only reach placement through the urgency sigmoid, blended with priority into one scalar. A high-priority deadline-free task can and does outrank a low-priority task due tomorrow and take its slot.
 
### Change
 
Add a sorting tier **above** the effective-score comparison, ordered by **slack** ascending:
 
```
slack = deadline - now - requiredBlockMinutes
```
 
Placement rules:
 
- Applies only to leaves whose deadline falls within the scheduling horizon. Deadline-free and far-future leaves sort in the existing tier, after all EDF-tier items.
- Sits **below** the existing constrained tier (constrained-vs-unconstrained remains the primary split — scarce-window items still get first pick).
- Keep it a discrete tier, not a score adjustment. Folded into the score it would be diluted by priority, which is the bug being fixed.
- `requiredBlockMinutes` is the full duration for a plain leaf and the **minimum chunk** for a split leaf — reuse `placementBlockMinutes` from `capacityCheck.ts` rather than recomputing.
Apply the identical comparator in **both** places: the candidate sort in `sortByPriorityAndConstraints` and the forward-pass leaf ordering in `scheduleTasksAndGoals` (currently `(constrained desc, leafEffScore desc, scheduleIndex asc)` **[verified-in-doc]**). These two orderings must not disagree. If the comparator isn't already shared between them, extract it — that refactor is in scope for this task.
 
### Acceptance
 
- Two tasks, equal duration, one due tomorrow at priority 1 and one deadline-free at priority 5: the deadline task places first. Currently it does not.
- No new `SCHEDULED_LATE` messages appear in the fixture runs; ideally some disappear.
- Ordering remains total and deterministic — ties in slack fall through to `leafEffScore`, then `scheduleIndex`.
### Optional follow-up (separate commit, only if cheap)
 
An aggregate feasibility sweep: prefix-sum the required minutes of all leaves grouped by deadline date and compare against cumulative `getDayAvailableMinutes` over the same range. `maxEffectiveCapacityFor` asks whether *one* block fits somewhere; nothing currently asks whether the *sum* of everything due by Friday fits before Friday. One sweep tells you up front that someone will be late, which lets you choose the victim deliberately instead of letting sort order pick. Emit as a warning message; do not change placement behavior on it yet.
 
---
 
## 4. Same-duration polish pass
 
**File:** new, e.g. `helpers/Scheduler/polishPass.ts`, called from `scheduleTasksAndGoals.ts`
 
### Rationale
 
The greedy forward pass reliably produces this: Tuesday's one-hour errand near the office and Wednesday's one-hour errand at home get placed in whatever order the sort emitted, each dragging its own commute. Swapping them is strictly better and geometrically trivial.
 
### Change
 
After the pool empties and **after** the final compromise pass, run exactly one non-iterating pass:
 
- Consider only pairs of **placed dynamic** events (not plans, templates, completed, memoized, external).
- Require **identical duration**. This is what makes it safe: the swap is a pure slot exchange, no re-splicing, no capacity risk, no leftover-fragment reconstruction.
- Require mutual constraint compatibility both ways: category eligibility (`categoryEligibilityMap`), allowed-times chain, earliest-start date, and the precedence/chain bounds of both leaves.
- Bound the candidate window: only pair events within N days of each other (start N = 7).
- Objective: accept only a **strict** improvement in `(total travel minutes, total lateness)` — pick one lexicographic order and document it.
- Recompute the two affected travel edges only. Removal via `travelId` identity, as everywhere else.
- One pass. No fixpoint, no re-entry. Bounded at O(n × k) with small k.
### Hard requirements
 
- Swapping must go through the normal reservation path so travel shards and buffers are reconstructed correctly. Do **not** hand-edit slot boundaries.
- If a swap fails partway, roll back to the pre-swap state. A half-applied swap is worse than no swap.
- Must respect `placementCutoffDate` — a swap must not move an event into the tail buffer.
- Gate behind a flag, default **off** initially.
### Acceptance
 
- The two-errands scenario above: the pass swaps them and total travel drops.
- A pair differing in duration by one minute is never swapped.
- A swap that would violate either leaf's allowed-times or chain bound is rejected.
- Running the pass twice on the same input produces the same result as running it once (no oscillation).
---
 
## 5. Smaller fixes
 
Each is independently committable. Do them after 1–4 land.
 
### 5a. Constrained tier misses allowed-times leaves
 
**File:** `helpers/Scheduler/scheduleTasksAndGoals.ts` (and the shared comparator from Task 3)
 
The constrained-tier predicate is currently "resolved category is non-null" **[verified-in-doc]**. A task restricted to Tuesday 18:00–20:00 via `allowedTimes` is far more constrained than a task in a category with 40 weekly window-hours, yet gets no priority. Extend the predicate to include a non-empty allowed-times chain. One-line change, fixes a real inversion.
 
### 5b. Order the constrained tier by scarcity
 
Within the constrained tier, sort by total weekly eligible window minutes ascending — four hours a week places before forty. True MRV (per-leaf fitting-slot counts) is O(leaves × slots); skip it. The weekly-minutes proxy is adjacent to values `maxEffectiveCapacityFor` already computes and caches per category, so reuse that cache. Do not add a second uncached traversal.
 
### 5c. Fit-tightness strategy
 
**File:** new strategy in `strategies/`, registered in `helpers/CalendarGenerator/buildSchedulingStrategy.ts`
 
`selectBestSlot` accepts the first slot that fits, and nothing scores wasted headroom — so a 30-minute task shatters a four-hour gap while a 35-minute gap goes unused the same day. Add a tightness term (higher score = less leftover headroom) at weight ~0.15: enough to break ties among same-day slots, not enough to override earliness.
 
**Critical caveat:** invert or disable this for chunked placements. `grantChunkMinutes` genuinely wants headroom to grow into; a tightness bonus fights it directly. The strategy needs to know whether it's scoring a chunk — if that isn't reachable from `(task, slot, context)`, resolve it before building the strategy rather than guessing.
 
Note this interacts with the buffer setting: at a 2-minute buffer, "fits" is nearly "fits exactly," so tightness has more to bite on than it would at 15.
 
### 5d. Chunk sizing is greedy toward minimum
 
**File:** `helpers/Scheduler/scheduleSplitTask.ts`
 
With `maxMinutes: 0` (the unlimited sentinel), chunks fit-test at `minMinutes` and take the earliest qualifying slot **[verified-in-doc]**, fragmenting work into many small chunks when fewer large ones would serve better. Add a two-pass search: look for slots ≥ a preferred chunk size first, fall back to `minMinutes` only if none exists. This mirrors the relaxation pattern already used by the final compromise pass — follow that structure rather than inventing a new one. Preferred size could start as `2 × minMinutes` or a configured value.
 
### 5e. Aging on retry
 
**File:** `helpers/Scheduler/scheduleTasksAndGoals.ts`
 
`NO_SLOTS` leaves are retained and retried in the same sort order every iteration **[verified-in-doc]**, so a leaf that keeps losing keeps losing. Add an attempt counter to the leaf pool entry and use `attempts desc` as a tiebreak below the score tiers. Classic anti-starvation; costs one field. Must not override the constrained or EDF tiers.
 
---
 
## 6. Tuning UI: sliders
 
**Files:** wherever the TUNING panel and persisted per-user weights live **[assumed — verify]**
 
Current panel exposes: *Buffer between items* (2 min), *Earliest slot* (1.00), *Location grouping* (0.20).
 
### The redundancy
 
`CompositeStrategy` takes a weighted **mean**, so with exactly two strategies **only the ratio matters** — `(1.0, 0.2)` and `(5.0, 1.0)` produce identical rankings. Two sliders, one real degree of freedom. A user adjusting both is chasing a phantom, and "should Earliest be 1.0 or 2.0?" has no answer.
 
Two acceptable resolutions — pick one and note it in the PR:
 
1. Collapse to a single balance slider: *sooner ↔ better grouped*.
2. Normalize weights internally and repurpose the second slider for something genuinely orthogonal — **travel-time sensitivity** is the natural candidate once Task 1 lands, since it's currently buried as a hard-coded constant.
Option 2 is preferable; it gives the proportional penalty a user-facing control.
 
### Do not fix Task 1 by moving default weights
 
If weights are persisted per user, shifting defaults fights everyone who's already tuned theirs, and users who moved the slider never receive the fix at all. The saturation cap lives *inside* the strategy, below the weight — no slider position makes distance matter. Task 1 must be implemented in the strategy.
 
### Note on Task 5c
 
Adding a third strategy breaks the ratio-redundancy argument above (three weights, two degrees of freedom). Sequence the UI change and 5c together, or the panel will be wrong for whichever interval separates them.
 
---
 
## 7. Sequencing summary
 
| Order | Task | Flagged? | Placement churn |
| --- | --- | --- | --- |
| 1 | Proportional travel penalty | no | **large, global** |
| 2 | De-saturate earliness curve | no | moderate, far-horizon only |
| 3 | EDF tier | yes | moderate |
| 4 | Same-duration polish pass | yes, default off | small, additive |
| 5a–5e | Smaller fixes | no | small each |
| 6 | Slider rework | n/a | none |
 
Tasks 3 and 4 are flag-gated so they can be A/B'd against a real calendar for a week before default-on. Task 1 cannot be usefully flagged — it's a correction, not a preference — so it ships plain and eats the diff.
 
## 8. Testing notes
 
- New full-pipeline tests should extend the **trimmed live-data fixture pattern** in `__tests__/calendar-generation/fixtures/`. Hand-built minimal fixtures rarely produce a valid slot fabric and **fail silently** **[verified-in-doc]** — this is a documented trap, don't walk into it.
- Hand-built inputs are acceptable only where the test's specific geometry demands it (the existing seam, window-exception, cascade, split-task, goal-day-cap, and scheduling-constraints tests are the precedent).
- For each task, write the failing test **before** the change. Several diagnoses above are behavioral claims that should be confirmed empirically, not taken on faith from this document.
- After Task 1, re-run the full engine suite and triage every moved expectation individually. Do not bulk-update snapshots.