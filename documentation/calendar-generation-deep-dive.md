# Calendar Generation — Deep Dive

This document describes the `utils/calendar-generation/` engine: the code that turns the user's planners, templates, and previously persisted calendar into a fresh `{ events, categoryEvents, travelEvents, plannerScores, messages }` payload on every regeneration.

The engine is a stateful pipeline. Read top-to-bottom; later sections assume the data structures and phase ordering established earlier.

> Scope. This is engine-only. Cross-cutting models that feed the engine (`Planner`, `EventTemplate`, `Category`, `Location`, `TravelTime`) are referenced where relevant but defined in `prisma/schemas/models/`.

---

## 1. High-Level Overview

`generateCalendar(...)` is a single-shot, deterministic transformation:

```
inputs:
  userId, weekStartDay,
  templates:       EventTemplate[]         (recurring weekly blocks)
  planners:        Planner[]               (tasks, goals, plans, etc.)
  previousCalendar:SimpleEvent[]           (so we can preserve memoized past)
  options:         GenerateCalendarOptions (travel matrix, categories,
                                            queues/dependencies,
                                            externalBusyEvents, ...)

output:
  events:         SimpleEvent[]              // plans, scheduled tasks, completed, memoized
  categoryEvents: CategoryEvent[]            // materialized weekly category occurrences
  travelEvents:   TravelEvent[]              // travel blocks between scheduled items
  plannerScores:  Record<string, number>     // per-planner urgency scores (ephemeral, not persisted)
  messages:       EngineMessage[]            // engine console rows (failures, warnings, SCHEDULED_OK)
```

The pipeline is built on three central data structures:

- **The slot array** — a single mutable, time-sorted array (`TimeSlotManager.slots`) holding every minute of the scheduling horizon as a sealed union: `AvailableSlot | OccupiedSlot | CategorySlot | TravelSlot`.
- **The static-pass state machine** — walks the slot array in order and decides where to place travel between consecutive non-matching locations. Runs once preliminarily, then again at the seam after every incremental expansion.
- **The dynamic scheduler** — iterates priority-sorted candidate tasks/goals, scores remaining placeable slots, and reserves them (along with inbound/outbound travel) via splice.

The horizon is **bounded** (28 days initially, see [constants.ts:80](../utils/calendar-generation/constants.ts#L80)). As the scheduler runs out of room, [expandSlots](../utils/calendar-generation/helpers/Scheduler/expandSlots.ts) appends another chunk from a marked pickup point. A single Plan a year out no longer balloons the initial slot array.

---

## 2. Public Surface

### Entry point

[utils/calendar-generation/calendarGeneration.ts](../utils/calendar-generation/calendarGeneration.ts) exports `generateCalendar(userId, weekStartDay, templates, planners, prevCalendar, options)`. It is a thin wrapper that:

1. Normalizes the optional `bufferTimeMinutes`-as-number legacy arg into a `GenerateCalendarOptions` object.
2. Builds a `LoggingConfig` from local flags (see [Debugging](#13-debugging-the-engine)).
3. Constructs `new CalendarGenerator(weekStartDay, input).generate()` and returns the resulting `{ events, categoryEvents, travelEvents, plannerScores, messages }`.

### Module exports

[index.ts](../utils/calendar-generation/index.ts) re-exports the public surface: `generateCalendar`, the core classes (`CalendarGenerator`, `TimeSlotManager`, `Scheduler`), the strategy interface + built-ins, the model types (`TimeSlot` union, `SchedulingResult`, `SchedulingContext`, `SchedulingFailure`, etc.), the `dateTimeService`, the validation helpers, and the shard-model utilities from `timeSlotUtils`.

### Tunable constants

All scheduling knobs live in [constants.ts](../utils/calendar-generation/constants.ts). The key ones:

| Constant | Value | Purpose |
| --- | --- | --- |
| `SCHEDULING_CONFIG.HORIZON_CHUNK_DAYS` | 28 | Days the initial slot build covers; each expansion appends another chunk of this size. |
| `SCHEDULING_CONFIG.LOW_SLOT_WATERMARK` | 100 | When the slot array has fewer Available slots than this, the scheduler triggers proactive expansion before the next placement attempt. |
| `SCHEDULING_CONFIG.PLACEMENT_BUFFER_DAYS` | 3 | Tail buffer at the trailing edge of the horizon where dynamic placement is suppressed. Leaves room for the next expansion's static-pass resume. |
| `SCHEDULING_CONFIG.MAX_HORIZON_EXPANSIONS` | 30 | The maximum scheduling horizon as expansion iterations, and the SOLE stop for the outer loop: `MAX_HORIZON_EXPANSIONS * HORIZON_CHUNK_DAYS` ≈ 2 years. The loop expands on demand until every placeable item is scheduled or it hits this ceiling; an item that can't be reached within it (e.g. an `earliestStartDate` years out) fails loudly rather than marching the horizon over many O(fabric) passes and materializing years of background/travel events. There is no earlier heuristic stop — an item blocked by a currently-full stretch only places once expansion reaches past it, and no cheap signal distinguishes that from a permanent stall (genuinely unplaceable items already exit as `TOO_LARGE`/`IMPOSSIBLE_CONSTRAINTS` permanent failures). |
| `SCHEDULING_CONFIG.SLOT_SEARCH_NEAR_WINDOW_DAYS` / `SLOT_SEARCH_WIDE_WINDOW_DAYS` | 90 / 360 | The slot-search window ladder, measured from the task's effective earliest start: `scheduleTask` escalates NEAR → WIDE → uncapped. A rung whose candidates are geometrically absent OR all rejected at selection (capacity + travel, day budgets) hands off to the next — a non-empty inner window can still be entirely unusable, and horizon expansion never changes its content, so failing `NO_SLOTS` there would starve forever. The bounded rungs keep the fallback as near as possible: past ~two weeks the earliest-slot score saturates, and an uncapped scan would let location-grouping alone pick a slot months beyond the nearest fit. A rung whose window already covered the whole built fabric ends the ladder (`windowCoversFabric` — a wider scan would be byte-identical). A soft preference ladder, never a hard cap — no slot is hidden. |
| `SCHEDULING_CONFIG.MAX_ITERATIONS` | 10000 | Safety net against infinite loops. |
| `SCHEDULING_CONFIG.MIN_SLOT_SIZE` | 5 | Smallest slot the geometry helpers will preserve. |
| `SCHEDULING_CONFIG.ADJACENT_TRAVEL_TOLERANCE_MS` | 10 min | Slack for matching adjacent travel slots (used by `findAdjacentTravel*`). |
| `SchedulingFailureReason` | enum | `TOO_LARGE`, `NO_SLOTS`, `IMPOSSIBLE_CONSTRAINTS`, `ITERATION_LIMIT`, `DEPENDENCY_CONFLICT`, `INVALID_TASK`, `TEMPLATE_ERROR`. |

Strategy weights and scoring values live separately in [strategies/defaultStrategy.ts](../utils/calendar-generation/strategies/defaultStrategy.ts) (covered in [Section 10](#10-strategies)).

---

## 3. Models

### The TimeSlot Union

[models/TimeSlot.ts](../utils/calendar-generation/models/TimeSlot.ts) defines the sealed union that flows through the entire pipeline:

```
Slot = AvailableSlot | OccupiedSlot | CategorySlot | TravelSlot

AvailableSlot   { type:"available",  start, end, durationMinutes,
                  prevLocationId?, nextLocationId? }

OccupiedSlot    { type:"occupied",   start, end, durationMinutes,
                  eventId, plannerType, eventType, locationId? }

CategorySlot    { type:"category",   start, end, durationMinutes,
                  categoryId, isStrictCategory,
                  currentLocationId, prevLocationId, nextLocationId,
                  trespassingStart?, trespassingEnd?,
                  isFinal? }

TravelSlot      { type:"travel",     start, end, durationMinutes,
                  eventId, eventType:"travel",
                  travelFromLocationId, travelToLocationId,
                  travelType: "preliminary" | "inbound" | "outbound",
                  insufficientTravel,                  // red marker
                  overconstrained?,                    // yellow marker
                  requiredTravelMinutes,
                  consumedCategoryIds?,
                  // --- shard model ---
                  travelId?,
                  originalType?: "available" | "category",
                  originalSourceStart?, originalSourceEnd?,
                  originalCategoryId?, originalLocationId?,
                  originalIsStrictCategory?,
                  originalPrevLocationId?, originalNextLocationId? }
```

A few invariants worth internalizing:

- `locationId === null` on Occupied means **"Anywhere"**. Travel decisions propagate *through* an Anywhere event rather than ending at it.
- `AvailableSlot.prevLocationId` / `nextLocationId` represent the location the user is at when the gap begins / ends. They are the only thing the static pass needs to decide whether and where travel goes.
- `CategorySlot.currentLocationId` is the category's own location (the user is *at* the category's location during the interior). `prevLocationId` / `nextLocationId` describe the surrounding context.
- `isFinal` is a single-instance pickup marker for incremental expansion; at most one slot in the array carries it (see [Section 8](#8-incremental-horizon-expansion)).
- `PlaceableSlot = AvailableSlot | CategorySlot` — strategies only score, and dynamic tasks only land in, one of these two.

### Scheduling Models

[models/SchedulingModels.ts](../utils/calendar-generation/models/SchedulingModels.ts) carries the shape contracts between phases:

- `CalendarGenerationInput` — the typed input to `CalendarGenerator`, including `previousEngineMessages` (which the message emitter consults to carry the user-owned `dismissed` flag forward by id), `queues` / `dependencies` (the precedence inputs), and `externalBusyEvents` (imported external-calendar events resolved to busy blocks — `SimpleEvent` shape, `eventType: external`; they join the fixed-event fabric and are filtered back out at final assembly).
- `CalendarGenerationResult` extends `SchedulingResult` with `categoryEvents`, `travelEvents`, `plannerScores`, and `messages` (the orchestrator's full output).
- `SchedulingContext` — the bag of state passed to every scheduling call: `userId`, `currentDate`, `weekStartDay`, `allPlanners`, `scheduledEvents`, `metrics`, `categories` (Map), `plannerLocationMap`, `plannerCategoryMap`, `categoryEligibilityMap`, `plannerConstraintsMap` (per-item earliest-start / allowed-times, resolved down the tree), `predecessorMap` (incoming queue/dependency edges per planner — the placement gate's input), `previousCalendarById` (identity reuse for stable regens), the optional `schedulerRecorder`, and the per-iteration `placementCutoffDate` (tail buffer).
- `SlotSelectionResult` — what `selectBestSlot` hands to `reserveTaskSlot`. Crucially carries `absorbableTravel` and `reclaimPrecedingGapTravel` as `TravelShardSpan | null`, so removal is by identity (`travelId`), not heuristic time search. `slideIntoFreedTravel` says whether the task back-extends into the freed span or keeps the candidate's clipped start (leg removed either way — see Section 16). Also carries `grantedDurationMinutes` — the minutes the reservation will actually occupy (`task.duration` for plain placements; what `ChunkSizing.grant` returned for chunked ones).
- `ChunkSizing` — dynamic sizing for chunked placement (split tasks, goal day caps): `{ minMinutes, grant(headroomMinutes, dayBudgetMinutes), dayBudget?(slotStart) }`. When passed to `scheduleTask`, slots are fit-tested at `minMinutes` and `grant` decides the reserved duration from the selected slot's real headroom — chunk sizes derive from calendar geometry, not a fixed block size. See [Section 6](#6-the-dynamic-scheduling-pipeline).
- `SchedulingFailure` — `{ taskId, taskTitle, reason: SchedulingFailureReason, details, context? }`.

### Template Models

[models/TemplateModels.ts](../utils/calendar-generation/models/TemplateModels.ts) defines `PerTemplateMask` — the normalized form templates take after expansion. `endMinutes` may exceed 1440 for midnight-crossing templates; downstream helpers handle the wrap.

---

## 4. The 12 Phases (CalendarGenerator)

[core/CalendarGenerator.ts](../utils/calendar-generation/core/CalendarGenerator.ts) is the orchestrator. Each phase delegates to a single function in [helpers/CalendarGenerator/](../utils/calendar-generation/helpers/CalendarGenerator/).

### Phase 1 — Validate input

[validateInput.ts](../utils/calendar-generation/helpers/CalendarGenerator/validateInput.ts) runs `validateGenerationInput` from the [CalendarValidator](../utils/calendar-generation/helpers/CalendarValidator/) module. On failure, returns immediately with `success: false` and empty arrays. Validation covers required fields (`userId`, `weekStartDay 0–6`), per-planner constraints (duration > 0 unless goal, `duration ≤ MINUTES_PER_WEEK`, valid deadline), per-template constraints (`startDay 0–6`, `startTime "HH:MM"`, `duration ≤ MINUTES_PER_DAY`), and same-day template conflict detection. A start-less plan is a *warning*, not an error — `buildPlanEvents` null-guards it, so a triaged-but-timeless plan doesn't blank the calendar.

### Phase 2 — Build initial event array

[buildInitialEventArray.ts](../utils/calendar-generation/helpers/CalendarGenerator/buildInitialEventArray.ts) combines three sources into a single `eventArray`:

1. **Memoized events** ([buildMemoizedEvents](../utils/calendar-generation/helpers/EventAssembler/buildMemoizedEvents.ts)) — items from `previousCalendar` whose end is before `now` and aren't templates/travel/category wrappers **or plans**. Preserved verbatim. Plans are excluded because they are deterministic from their own planner row — pinning the old emit would make the engine ignore a `starts` change on any plan whose block already ended. Split planners are excluded for the same reason: their frozen past is the completed-segment list on the row (re-emitted fresh by `buildCompletedEvents`), and an uncompleted past chunk must vanish so its minutes reschedule instead of freezing as if they happened.
2. **Plan events** ([buildPlanEvents](../utils/calendar-generation/helpers/EventAssembler/buildPlanEvents.ts)) — `Planner` rows with `plannerType: "plan"` and a `starts` timestamp, converted to `SimpleEvent` shape. Completion doesn't apply to plans: completion times on a plan row are ignored and the plan always renders at its `starts` anchor. Recurring plans (non-null `Planner.recurrence`) expand into one concrete event per occurrence via [expandPlanOccurrences](../utils/planRecurrence.ts), bounded to `currentDate + PLAN_RECURRENCE_WINDOW_DAYS` (and the rule's `until` / `MAX_PLAN_OCCURRENCES`), with deterministic composite ids `` `${planId}|${localStartKey}` `` so idle regens diff empty. Per-occurrence exceptions on the row (`recurrenceExceptions`) are applied during expansion: `deleted` occurrences are skipped, `moved` ones keep their original key but start at the override time. Occurrence events carry `plannerType: "plan"`, so they are excluded from memoization like plain plans; any engine site resolving a planner from an event id must use `plannerIdFromEventId` (slot location lookups, trespass marking, and SCHEDULED_LATE emission already do).
3. **Completed events** ([buildCompletedEvents](../utils/calendar-generation/helpers/EventAssembler/buildCompletedEvents.ts)) — tasks/goals with `completedStartTime`/`completedEndTime` set, rendered at their actual completion window (not the originally-scheduled window). Plans are excluded — they are fixed-time anchors, not completable items. Split tasks are segment-driven: each entry in `Planner.completedSegments` renders as its own frozen event with id `` `${plannerId}|done:${segmentStart}` `` (`completedSegmentEventId`), re-derived from the row each regen; the classic completion-window path applies only when a split task has no segments (explicitly completed before any chunk was).

Returns `{ eventArray, memoizedEventIds, previousById }`. The ID set is used downstream to prevent the scheduler from re-scheduling already-frozen rows. `previousById` (previous emits keyed by id) rides into the scheduling context; every event builder passes its candidate through [stabilizeEvent](../utils/calendar-generation/helpers/EventAssembler/stabilizeEvent.ts), which reuses the previous emit's `extendedProps.id` / `createdAt` and returns the previous object outright when nothing meaningful changed — an unchanged placement must diff as a no-op, not a fresh-uuid phantom update (see [`stable-regen.test.ts`](../__tests__/calendar-generation/stable-regen.test.ts)).

### Phase 3 — Expand templates

[expandTemplates.ts](../utils/calendar-generation/helpers/CalendarGenerator/expandTemplates.ts) wraps the [TemplateExpander](../utils/calendar-generation/helpers/TemplateExpander/) module:

- `expandTemplates` materializes each `EventTemplate` into recurring `SimpleEvent` blocks across the horizon.
- `getPerTemplateMasks` produces `PerTemplateMask[]` (one mask per day-of-week occurrence) — the normalized form the slot builder consumes.
- `calculateLargestGap` computes the single largest contiguous gap in a clean week. Used by old `TOO_LARGE` heuristics; see [capacityCheck](#9-capacity-gating--placement-buffer) for the current, more accurate gate.
- `gapIntervalsForDay` returns the unoccupied intervals for any specific day, accounting for midnight-crossing templates via `endDayOffset`.

Returns `{ filteredEvents, recurringTemplateEvents, perTemplateMasks, largestTemplateGap, updatedMetrics }`.

**External busy fabric (between Phase 3 and slot building).** Any `input.externalBusyEvents` — imported external-calendar events resolved to busy blocks (`SimpleEvent` shape, `eventType: external`; see the "External calendars" domain note in CLAUDE.md) — are concatenated onto the template-filtered events to form `fabricEvents` ([CalendarGenerator.ts](../utils/calendar-generation/core/CalendarGenerator.ts) `[...filteredEvents, ...input.externalBusyEvents]`). It is `fabricEvents` — **not** `filteredEvents` — that feeds `buildAvailableSlots` (Phase 6a) and `prepareSchedulingContext` (Phase 8, as `scheduledEvents`), so external blocks act as occupied time in the initial carve and every horizon expansion. They are filtered back out at final assembly (Phase 11).

### Phase 4 — Build location, category, and precedence maps

Read-only derivations computed before any slot work (all off the planners + categories + precedence inputs, none touching the slot array):

- [buildLocationMap.ts](../utils/calendar-generation/helpers/CalendarGenerator/buildLocationMap.ts) wraps [LocationMapper/buildLocationMap.ts](../utils/calendar-generation/helpers/LocationMapper/buildLocationMap.ts). Resolution order per planner: **(1)** own `locationId` (unless `useParentLocation`), **(2)** ancestor chain via `parentId`, **(3)** the planner's effective category's `locationId`.
- [buildPlannerCategoryMap.ts](../utils/calendar-generation/helpers/CalendarGenerator/buildPlannerCategoryMap.ts) resolves each planner's effective categoryId by walking the parent chain, with memoization (O(n) overall even for deep trees).
- [buildCategoryEligibilityMap.ts](../utils/calendar-generation/helpers/CalendarGenerator/buildCategoryEligibilityMap.ts) resolves each category to the set of category ids whose windows its items may occupy (itself + non-confined ancestors, up to a `confineToOwnWindows` ceiling). Built off the full category list — the chain walks through classification-only ancestors. See [Section 12](#12-category-system) for how the match sites consume it.
- [buildPlannerConstraintsMap.ts](../utils/calendar-generation/helpers/CalendarGenerator/buildPlannerConstraintsMap.ts) resolves each planner's scheduling constraints (`earliestStartDate`, `allowedTimes`) down the tree: earliest = latest date in the chain, allowed = the chain of settings objects (intersected interval-wise at placement time — settings-level algebra would need day-set × range-set intersection for no gain). Plans are excluded (fixed anchors). Rides `SchedulingContext.plannerConstraintsMap`; parse/interval helpers live in [utils/allowedTimes.ts](../../utils/allowedTimes.ts).
- `buildPrecedenceEdges` + `buildPredecessorMap` turn the `queues` + `dependencies` inputs into `PrecedenceEdge`s (transparency already applied) and group them by successor into `predecessorMap` (the placement gate's input, rides `SchedulingContext`). `computeEffectiveScores` then folds the root-lifted edges into the urgency scores so a prerequisite rides its dependents' urgency (the candidate sort uses these; raw urgency still feeds `plannerScores`). The raw urgency pass itself (`scoreCandidatesAndRootGoals`) runs earlier — near the top of `generate()`, before Phase 2 — and covers non-candidate root goals too.

### Phase 5 — Filter scheduled categories

Inside the `CalendarGenerator` constructor, `input.categories` is filtered down to those that both **opt in** via `useTimeWindows: true` **and** have at least one window in `timeSlots`. This `scheduledCategories` list is what constrains slot geometry and the static pass; categories that don't meet both conditions still contribute location inheritance via the planner location map, but their windows and strictness do not affect scheduling.

### Phase 6 — Build slots + run preliminary travel pass

This is the most consequential phase. It happens in three sub-steps:

**6a. Build available slots.** [buildAvailableSlots](../utils/calendar-generation/helpers/TimeSlotManager/buildAvailableSlots.ts) produces the initial slot array covering `[today, today + HORIZON_CHUNK_DAYS]`:

1. Filter events/templates inside the horizon.
2. [inheritLocationFromCategoryPeriods](../utils/calendar-generation/helpers/TimeSlotManager/inheritLocationFromCategoryPeriods.ts) — for any Occupied interval fully inside a category period that has a location, stamp the category's location onto the interval so subsequent splits propagate location through it.
3. Find gaps between Occupied intervals → `AvailableSlot[]`.
4. [splitSlotsAtCategoryBoundaries](../utils/calendar-generation/helpers/TimeSlotManager/splitSlotsAtCategoryBoundaries.ts) — slice Available slots wherever a category period begins or ends. Inside a category window the fragment becomes a `CategorySlot`; outside it remains `AvailableSlot`. An entry-location cursor threads each split's `prevLocationId` / `nextLocationId`. Periods arrive pre-expanded (and exception-adjusted) from [expandCategoryWindowPeriods](../utils/calendar-generation/helpers/TimeSlotManager/expandCategoryWindowPeriods.ts), computed once per `buildAvailableSlots` call and shared with `inheritLocationFromCategoryPeriods`.
5. Propagate "Anywhere" locations forward (`prevLocationId`) and backward (`nextLocationId`) through the array, so a gap surrounded by located events inherits both ends.
6. Sort the unified slot array by start time.

**6b. Static travel pass.** `timeSlotManager.slots = [...builtSlots]`, then [staticEventTravelPass](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/staticEventTravelPass.ts) runs. See [Section 7](#7-the-static-travel-pass).

**6c. Drop past Available slots.** [dropPastAvailableSlots](../utils/calendar-generation/helpers/TimeSlotManager/dropPastAvailableSlots.ts) removes Available gaps ending at or before `currentDate`. Past Travel, Occupied, and Category slots remain (for memoized rendering).

### Phase 7 — Build the dynamic scheduling recorder

[SchedulerRecorder](../utils/calendar-generation/helpers/Scheduler/SchedulerRecorder.ts) is constructed with the same filter pattern as `TravelPassRecorder`: off unless `enableLogging && logging.dynamicScheduling`, optionally scoped to `[dateRangeStart, dateRangeEnd]`. Every `scheduleTask` call appends a record.

### Phase 8 — Prepare scheduling context

[prepareSchedulingContext.ts](../utils/calendar-generation/helpers/CalendarGenerator/prepareSchedulingContext.ts) packs everything into a single `SchedulingContext` object: userId, current date, week start, planners, scheduled events (`fabricEvents`, external busy blocks included), metrics, the `Category` lookup map, all five Phase 4 derivations (planner→location, planner→category, category eligibility, planner constraints, predecessor map), `previousCalendarById` (identity reuse for stable regens), and the scheduler recorder.

### Phase 9 — Prepare candidates

Urgency scoring runs once near the top of `CalendarGenerator.generate()` — just after validation, before Phase 2 and long before this phase — via [scoreCandidatesAndRootGoals](../utils/calendar-generation/helpers/PrioritySorter/sortByPriorityAndConstraints.ts). The pass covers scheduling candidates (standalone tasks + ready root goals) **plus every top-level uncompleted goal**, so consumers like the dashboard can rank goals the scheduler intentionally skipped (e.g. not-yet-ready ones) using the same denominator (sum of all planner durations). The resulting map is returned in `plannerScores` and passed into this phase.

Scoring itself: tasks without a deadline get `MIN_URGENCY_MULTIPLIER * priority`; tasks with a deadline use a sigmoid over deadline proximity (parameters in `URGENCY_CONFIG`: `CURVE_STEEPNESS: 4`, `CRITICAL_THRESHOLD: 0.7`, scaled into `[URGENCY_SCALE_MIN, URGENCY_SCALE_MAX] = [0.3, 1.0]`).

[prepareCandidates.ts](../utils/calendar-generation/helpers/CalendarGenerator/prepareCandidates.ts) returns the ordered list of planners the scheduler will try:

- Excludes memoized rows.
- Excludes completed tasks — completed items render via `buildCompletedEvents` (Phase 2) and must never re-enter scheduling.
- Keeps ready root goals (`isReady === true`), plus **ready** tasks whose root ancestor is **not** a goal (standalone tasks and task-rooted subtrees). Readiness is the universal gate: a task also needs `isReady === true` to become a candidate (tasks/plans default ready on create, so this is transparent for the common case; a user or the assistant can hold a task off the calendar by un-readying it). Tasks inside a goal subtree are owned by the goal's readiness gate instead — the flat scheduler places a goal's leaves when the root is ready (via `buildLeafGraph`), and an unready goal's subtree stays off the calendar entirely; they are excluded here regardless of their own flag (they inherit the root's readiness via the cascade). Admitting goal-subtree tasks individually would make readying a no-op.
- Excludes **detour targets actively spliced by a candidate** — the followed set comes from the same enumerator walk the leaf graph uses (`getScheduledLeafSequence`'s `followedTargets`), so a target schedules via the host splice, never twice. A target whose every host is completed, unready, or otherwise not a candidate schedules independently.
- Sorts via [sortByPriorityAndConstraints](../utils/calendar-generation/helpers/PrioritySorter/sortByPriorityAndConstraints.ts) — two-tier sort: category-constrained items first (because they have fewer eligible slots), then by descending score. The score fed here is the **inheritance-adjusted** `computeEffectiveScores` (a prerequisite rides its dependents' urgency), not raw urgency; raw urgency still feeds `plannerScores` for the dashboard. Ordering is decided here before any slot scoring.

### Phase 10 — Schedule tasks and goals

Constructs `new Scheduler(timeSlotManager, travelManager, strategy, context)` and calls `scheduleTasksAndGoals(...)`. See [Section 8](#8-incremental-horizon-expansion) for the outer loop; see [Section 6](#6-the-dynamic-scheduling-pipeline) for the per-task pipeline. Besides events and failures, the call returns the constraint-compromise records accumulated during placement (`splitRelaxations`, `goalCapRelaxations`) — Phase 12 turns them into engine messages.

### Phase 11 — Assemble final events

[assembleFinalEvents.ts](../utils/calendar-generation/helpers/CalendarGenerator/assembleFinalEvents.ts) produces three of the output arrays (a fourth output, `plannerScores`, comes from the Phase 9 scoring pass — see above; a fifth, `messages`, comes from Phase 12 — see below):

- **`events`** — memoized + plan + completed + scheduled tasks + templates, with trespass flags stamped via [markTrespassingEvents](../utils/calendar-generation/helpers/EventAssembler/markTrespassingEvents.ts) and template **and external busy** events filtered out at the end via [assembleFinalEventList](../utils/calendar-generation/helpers/EventAssembler/assembleFinalEventList.ts) (it drops both `EventType.template` and `EventType.external`, so imported external-calendar busy blocks — which were injected into the fabric only to carve slots — never reach the persisted output; they live in their own `ExternalEvent` rows owned by the refresh path).
- **`categoryEvents`** — [buildCategoryEvents](../utils/calendar-generation/helpers/EventAssembler/buildCategoryEvents.ts) materializes one `CategoryEvent` per `CategoryTimeWindow` per matching day across the horizon. IDs are composite: `` `${categoryTimeWindowId}|${YYYY-MM-DD-local}` ``. [stampCategoryEventBorders](../utils/calendar-generation/helpers/EventAssembler/stampCategoryEventBorders.ts) propagates `trespassingStart` / `trespassingEnd` flags from category slots and insufficient-travel slots onto the persisted rows.
- **`travelEvents`** — [generateTravelEvents](../utils/calendar-generation/helpers/TravelManager/generateTravelEvents.ts) merges contiguous shards of each logical travel back into a single `TravelEvent`, keyed by `travelId`.

The horizon for category wrapper expansion is re-derived from the final slot array via [deriveSchedulingHorizon](../utils/calendar-generation/helpers/TimeSlotManager/deriveSchedulingHorizon.ts); the latest slot's end is used, so wrappers extend with any expanded chunks.

### Phase 12 — Emit engine messages

[coalesceMessages.ts](../utils/calendar-generation/helpers/CalendarGenerator/coalesceMessages.ts) (`buildEngineMessages`) reads the Phase 10 failure list plus the Phase 11 output (finalized events + travel events) and produces the persisted `EngineMessage[]` array the console renders. Each per-type emitter writes rows already keyed by their identity tuple, so there is no post-hoc fold:

- **`TASK_TOO_LARGE`** — one row per planner that failed with `TOO_LARGE`. Payload carries `{ duration, maxCapacity }` (structured — the renderer builds the body).
- **`TASK_UNSCHEDULABLE`** — one row per (plannerId, reason) for every non-`TOO_LARGE` failure. Payload carries `reason` only; prose lives in [renderEngineMessage.ts](../utils/renderEngineMessage.ts) so a copy rewrite doesn't require a data migration.
- **`SCHEDULED_LATE`** — one row per placed planner event whose scheduled start is after the deadline inherited via parent walk, guarded so completed tasks and not-yet-passed deadlines don't emit.
- **`INSUFFICIENT_TRAVEL`** — coalesces recurring travel legs by `(from, to, actualMinutes, timeOfDay, dayOfWeek)`; 400 repeats of the same short leg fold to one row with `affectedCount`.
- **`SPLIT_CONSTRAINT_RELAXED`** — one warn-tone row per (plannerId, kind) from Phase 10's `splitRelaxations`: `maxChunk` = the carving rule forced a chunk beyond `maxMinutes` (a remainder under `2*min` can only place whole), `dayCap` = the final compromise pass placed chunks past the task's per-day cap rather than dropping the minutes. N compromised chunks fold into one row carrying `affectedCount` + `totalMinutes`; both ride in the id, so a changed compromise supersedes the prior (possibly dismissed) row while an identical regen diffs empty.
- **`GOAL_DAY_CAP_RELAXED`** — same shape per (goalId, kind) from `goalCapRelaxations`: `oversizedLeaf` = a single block (or a split leaf's minimum chunk) is bigger than the goal's daily cap and placed whole, `dayCap` = the final compromise pass exceeded the cap. `capMinutes` is an emit-time fact excluded from the id (like `TASK_TOO_LARGE.maxCapacity`) — a cap edit alone doesn't resurface a dismissed row; a changed compromise does.
- **`SCHEDULED_OK`** — one info-tone row per regen with `placedCount` in the id, so a change in count supersedes the prior card. Skipped when count is zero.

The emit array is deduped by id (keep-first) before diffing — id is the DB primary key, so duplicate ids in one array would double-create in the sync transaction (the known producer: a never-scheduled task failing once per expansion pass).

Dismissal is user-owned. `buildDismissedSet(previousEngineMessages)` extracts every id whose prior row had `dismissed: true`; when the current emit produces the same id, the flag is carried forward. A fresh id (situation shifted) surfaces as a new, undismissed row. The engine never flips the flag back on its own, so the consoles offer the recovery path: a "Show dismissed" section (calendar EngineConsole) / always-visible dismissed group (item Alerts tab) with a restore button dispatching `undismissEngineMessage` — the flip rides the same diff sync as dismissal. Full identity model and payload shapes live in [models/EngineMessage.ts](../utils/calendar-generation/models/EngineMessage.ts).

The `createdAt` / `updatedAt` fields are left empty on emit — the DB owns them, and `compareCalendarData` strips both sides before comparing so the placeholders don't mark rows spuriously changed.

---

## 5. Slot Building & Geometry

### Single mutable array

[TimeSlotManager](../utils/calendar-generation/core/TimeSlotManager.ts) is intentionally thin (~22 lines). Its only job is to hold the canonical `slots: Slot[]` array, sorted by start time. All geometry helpers operate on this array directly via `splice`. There is no per-day bucketing; filter by `slot.type` for kind-specific views.

### Buffer model for dynamic placement

The buffer rule is "**each unit owns its own leading and trailing buffer; travel sits flush against the task**". Inside a slot a dynamic placement looks like:

```
[slot.start] [leading buffer] [travel-before] [task] [travel-after] [trailing buffer] [slot.end]
```

Three special cases:

- If `selectBestSlot` discovers travel-before fits **standalone** in an earlier slot (via [canPlaceStandaloneTravelBefore](../utils/calendar-generation/helpers/TravelManager/canPlaceStandaloneTravelBefore.ts)), the task lands flush at `slot.start` — the standalone travel's end becomes the leading boundary and the earlier slot owns the buffer.
- If no travel-before is needed, the leading buffer still applies.
- Leftover slots after splicing are created flush with the unit's edges (no `+bufferMs` offset). The recursive "each placement owns its own buffer" rule yields exactly one buffer of separation between consecutive dynamic placements in the same slot, with no double-counting.

Static placements (plans, templates, category-wrapper travel) are always flush with their owning event; the buffer model only applies to dynamic tasks.

### Geometry helpers

[helpers/TimeSlotManager/](../utils/calendar-generation/helpers/TimeSlotManager/):

- `buildAvailableSlots` — initial 28-day slot build (see Phase 6a). Accepts a `startingLocationOverride` used at expansion seams.
- `expandCategoryWindowPeriods` — THE window-occurrence expansion: every window of the given categories resolved to concrete `CategoryWindowPeriod`s over a range, with per-occurrence exceptions (`CategoryTimeWindow.recurrenceExceptions`) applied — deleted occurrences vacated, moved ones re-emitted at their override with `originalStart` preserved. Moved occurrences are emitted by the range that CONTAINS the override, not the range iterating the original day (same containing-range rule as template `masksToIntervals` — chunked expansion would otherwise drop or duplicate a cross-seam move). Shared by the slot fabric (`splitSlotsAtCategoryBoundaries`, `inheritLocationFromCategoryPeriods`), CategoryEvent materialization (`buildCategoryEvents`), and wrapper recovery (`findCategoryWrapper`), so they cannot disagree on which occurrences exist. Capacity heuristics stay exception-unaware by design.
- `splitSlotsAtCategoryBoundaries` — carve Available at pre-expanded category period edges; outside-fragments stay Available, inside-fragments become CategorySlots; threads entry-location across fragments.
- `inheritLocationFromCategoryPeriods` — stamp period locations onto Occupied intervals fully inside pre-expanded window periods.
- `expandSlotForDay` — resolve a single `CategoryTimeWindow` rule to concrete bounds for a given day, exception-unaware. Handles overnight slots by adding 24h when `endTime ≤ startTime`. Used by `expandCategoryWindowPeriods` and the clean-week capacity heuristics.
- `findAllFittingSlots` — return all `PlaceableSlot[]` where the placement's fit-test size (`task.duration`, or `ChunkSizing.minMinutes` for chunked placements) plus buffer fits, respecting the task's eligible window-category set (own category + non-confined ancestors) and the per-iteration `placementCutoffDate`. Strict categories the task is not eligible for are filtered out for uncategorized tasks too. Candidates are copies clipped to `afterDate`; when the task carries an allowed-times chain, each candidate is further clipped into the sub-fragments satisfying every settings object (one slot can yield several fragments), so the whole placement unit lands inside an allowed window.
- `reserveSlotWithTravel` — atomic placement: removes any absorbed/reclaimed travel shards by `travelId`, splices in `[travel-before?, task, travel-after?]`, and reconstructs leftover Available/Category fragments via [restoreAbsorbedRange](../utils/calendar-generation/utils/timeSlotUtils.ts).
- `dropPastAvailableSlots` — strip Available slots ending ≤ `now`.
- `deriveSchedulingHorizon` — return the latest end across all slots (or a fallback). Used for category-wrapper materialization so expansion extends the wrappers too.
- `getDayAvailableMinutes` / `getDaySlots` — sum or list placeable slots overlapping a given day.

---

## 6. The Dynamic Scheduling Pipeline

[helpers/Scheduler/](../utils/calendar-generation/helpers/Scheduler/) implements a 5-phase per-task pipeline plus loop drivers.

### Per-task pipeline (`scheduleTask`)

[scheduleTask.ts](../utils/calendar-generation/helpers/Scheduler/scheduleTask.ts) runs the following for each candidate. The call optionally takes a `ChunkSizing` (split-task chunks, goal-day-cap placements): phase 2 then fit-tests slots at `sizing.minMinutes` instead of `task.duration`, phase 3 skips slots whose remaining day budget is below the minimum and asks `sizing.grant(headroom, dayBudget)` for the actual reserved minutes (returning 0 rejects the slot), and phase 4 reserves `grantedDurationMinutes` rather than the full duration.

1. **`validateTask`** — `task.duration > 0`. On fail: `INVALID_TASK`.
2. **`findValidSlots`** — resolves the task's effective location (`plannerLocationMap`) and category (`plannerCategoryMap` or `task.categoryId`), derives the eligible window-category set (`categoryEligibilityMap`), then calls `findAllFittingSlots`. The task is window-constrained only when that set intersects the window-bearing categories; otherwise it schedules in free time. Scheduling constraints (`plannerConstraintsMap`) are applied here: the effective earliest-start date rides the same `afterTime` seam goal-leaf chaining uses (max of the two), and the allowed-times chain is passed through for slot fragmentation. Returns `{ validSlots, fittingSlots, taskLocationId, constraintForTask, effectiveAfter, windowCoversFabric }` — `effectiveAfter` is the lower placement bound the candidates were clipped to, threaded into phase 3 so slide legality can be validated against the same bound; `windowCoversFabric` reports whether this rung's window already reached past the last built slot. On empty: `NO_SLOTS`. `scheduleTask` escalates phases 2–3 through the search-window ladder (`SLOT_SEARCH_NEAR_WINDOW_DAYS` → `SLOT_SEARCH_WIDE_WINDOW_DAYS` → uncapped): a rung whose candidates are geometrically absent or all rejected by phase 3 hands off to the next, stopping early when the rung already covered the fabric.
3. **`selectBestSlot`** — scores valid slots via the strategy, then walks candidates in descending score order. For each, computes travel-before / travel-after, inspects whether prior travel can be **absorbed** ([findAdjacentTravelFrom](../utils/calendar-generation/helpers/TravelManager/findAdjacentTravels.ts)) or a **preceding-gap return trip** can be **reclaimed** ([findPrecedingGapTravel](../utils/calendar-generation/helpers/TravelManager/findAdjacentTravels.ts)), and tests whether the effective slot capacity (extended over absorbable/reclaimable spans) can fit `requiredInside`. Absorb/reclaim decompose into two decisions: removing the redundant leg (always correct for a same-location follow-up) and **sliding** the task back into the freed span. The slide is validated per candidate — the back-extended task start must respect `effectiveAfter` and stay inside the candidate's allowed interval (see [Section 16](#16-key-gotchas--edge-cases)); when it fails, the leg is still removed but the task keeps the candidate's clipped start, the freed span stays free time, and no capacity bonus applies. Accepts the first slot that fits. Returns a `SlotSelectionResult` carrying any `absorbableTravel: TravelShardSpan | null`, `reclaimPrecedingGapTravel: TravelShardSpan | null`, and `slideIntoFreedTravel: boolean`.
4. **`reserveTaskSlot`** — computes the actual `taskStart` / `taskEnd` (accounting for buffer offset, standalone-before placement, and slot-start vs slot-interior position; with `slideIntoFreedTravel: false` the task keeps the candidate slot's start instead of riding the freed span's), opportunistically reserves a standalone travel-before if available, then calls `reserveSlotWithTravel` to perform the atomic splice. Absorb / reclaim shard removal is by `travelId` (no time-window search).
5. **`buildTaskEvent`** — constructs the `SimpleEvent`. If the placement falls inside a category window, the category's wrapper ID is attached for renderer grouping. Appends to `context.scheduledEvents` so subsequent placements see it.

### Outer loop (`scheduleTasksAndGoals`)

[scheduleTasksAndGoals.ts](../utils/calendar-generation/helpers/Scheduler/scheduleTasksAndGoals.ts) drives the flattened leaf pool (see "Flat-order scheduling" above) to convergence. Two pieces of bookkeeping are created once per run and shared across iterations: `SplitPlacementState` (per-task placed minutes, chunk ordinals, per-day ledgers — so a partially placed split task resumes from its remainder after horizon expansion instead of restarting) and `GoalCapState` (per-goal daily-cap ledgers, for the same reason).

- Per iteration: compute `placementCutoffDate = lastPlaceableSlotEnd − PLACEMENT_BUFFER_DAYS`.
- **Proactive expansion check**: count Available slots. Trigger [expandSlots](../utils/calendar-generation/helpers/Scheduler/expandSlots.ts) if either:
  - `availableCount < LOW_SLOT_WATERMARK`, **or**
  - The largest compatible slot for the biggest remaining leaf is smaller than that leaf's block size ([largestCompatibleSlotForLargestTask](../utils/calendar-generation/helpers/Scheduler/capacityCheck.ts) + `placementBlockMinutes` — a split leaf sizes as its required minimum chunk). Leaves whose chain predecessors or cross gate are still blocked are excluded (they can't use an expansion until they unblock, so they must not trigger one).
  - Then `continue` (skip the forward pass and re-check on the expanded array).
- **Forward pass**: walk pool leaves in `(constrained desc, leafEffScore desc, scheduleIndex asc)` order — category-constrained leaves pick slots first, matching the two-tier order `sortByPriorityAndConstraints` gives the candidate sort — attempting each via [placeLeaf](../utils/calendar-generation/helpers/Scheduler/placeLeaf.ts) once its chain predecessors are resolved and its cross gate is open. `placeLeaf` gates `TOO_LARGE` at the leaf's required block and dispatches split leaves to the chunk loop ([Split tasks](#split-tasks-chunked-placement) below); a partial split leaf keeps its chunks and stays in the pool. Resolved leaves (placed or permanently failed) are removed after the pass; `NO_SLOTS` leaves are retained for retry.
- **Zero-leaf candidates** (every leaf already completed/memoized) resolve through their OWN cross gate, publishing the gate bound as their chain end — a queue successor behind a fully-handled middle member stays bounded instead of jumping the chain. Resolution is a fixpoint re-run at the top of each iteration and after the horizon marking / compromise pass.
- **Reactive backstop**: if leaves remain after a full forward pass, run `expandSlots` and loop again. Exception: a pass in which NOTHING even attempted placement is a precedence deadlock (stale contradictory data — authoring validation refuses these), so the missing gate outcomes are force-failed instead of burning expansion budget; successors proceed with loud breaks.
- Stops when the pool empties (every placeable leaf scheduled) or the horizon reaches `MAX_HORIZON_EXPANSIONS × HORIZON_CHUNK_DAYS` (~2 years), its single ceiling. The loop expands on demand rather than at a fixed count; there is deliberately no earlier "unproductive" stop, because an item blocked by a currently-full stretch only places once expansion reaches past it and no cheap local signal distinguishes that from a permanent stall (items that truly can never place already leave the pool as `TOO_LARGE`/`IMPOSSIBLE_CONSTRAINTS` permanent failures). An item that can't be reached within the ceiling fails loudly instead of marching indefinitely.
- **Post-budget resolution phase**: with the expansion budget spent and leaves still standing, the tail is resolved without further expansions, in topological order. Most of what is left is usually not stuck at all — it is gate-BLOCKED behind one stuck predecessor and has never attempted placement. Repeated passes run with `allowDayCapRelaxation: true` (placing a chunk past a split task's or goal's per-day cap beats dropping the minutes entirely; scarcity stayed strict through every normal pass so expansion had its chance first). When a pass resolves nothing, the `horizon` failure outcome is stamped ONLY on sources that are genuinely stuck — one with an unresolved leaf that attempted and failed that pass, or whose leaf is trapped behind such a leaf through chain predecessors (transitive: a node-level anchor behind a stuck earlier step, a detour target behind a stuck host leaf) — never on sources whose leaves wait on another source's missing outcome. Successors then unblock one topological rank at a time, each bounded by the max end of what its predecessor actually placed, so a queue's tail members stay in order behind a horizon-overflowing head instead of scheduling unbounded near now, and only the truly stuck edge produces a `SEQUENCE_PAST_HORIZON` break. The phase terminates because every pass either shrinks the pool, stamps a new source, or exits. A final backstop covers shapes even the transitive rule cannot see (e.g. cross-gate cycles from stale data): stamp every still-missing outcome, then sweep to quiescence — topological order is not guaranteed there (those shapes have no consistent order), but multi-rank chains still resolve instead of being falsely reported unschedulable after a single sweep. Every day-cap compromise is recorded (`SplitPlacementState.relaxations` / `GoalCapState.relaxations`) and surfaced by Phase 12 as `SPLIT_CONSTRAINT_RELAXED` / `GOAL_DAY_CAP_RELAXED`. Guarded by [`queue-horizon-cascade.test.ts`](../__tests__/calendar-generation/queue-horizon-cascade.test.ts) (queue tail behind a stuck head; dependency chain behind a chain-blocked node anchor).
- Leaves still standing after the post-budget phase push one `NO_SLOTS` failure per structural root (message identity and console rows match the old per-candidate emission; a spliced target leaf reports on the target) — this exit used to be silent, which let a starved run report `SCHEDULED_OK` with zero events while the diff sync deleted every previously placed event. Failures for leaves that eventually placed on a later iteration are dropped at the end.

### Flat-order (leaf-driven) scheduling

The scheduler does NOT place a goal atomically. [buildLeafGraph](../utils/calendar-generation/helpers/Scheduler/buildLeafGraph.ts) flattens every candidate root into a single **leaf pool** and derives the precedence structure; `scheduleTasksAndGoals` then places leaves one at a time via the shared [placeLeaf](../utils/calendar-generation/helpers/Scheduler/placeLeaf.ts) primitive (the old `scheduleGoal` / `scheduleSingleTask` are absorbed).

- **Leaf pool + chain edges.** Each candidate's detour-spliced leaf sequence ([getScheduledLeafSequence](../utils/goalPageHandlers.ts)) yields consecutive-pair *chain edges* (`leaf_i → leaf_{i+1}`). This one construct encodes goal-internal ordering (a goal's leaves chain so they stay clustered and after the previous), detour splices (a `linkedItemId` placeholder redirects into the target's sequence), and **multi-reference** (a target referenced from several hosts lives once with chain predecessors from all of them). Deduped by leaf id.
- **Ordering.** Ready leaves (chain predecessors resolved, cross gate open) are placed in `(constrained desc, leafEffScore desc, scheduleIndex asc)` order. The constrained tier (the leaf's resolved category is non-null) gives window-bound work first pick at scarce slots. `leafEffScore` is leaf-level priority inheritance — a leaf inherits the max score of everything downstream that needs it (over chain + lifted queue/dependency edges), so a dependency's whole predecessor chain and a detour host's *before*-leaves ride their dependents' urgency; *after*-leaves don't. `scheduleIndex` is the clustering tiebreak.
- **Chaining + failure.** `afterTime` for a leaf = max over its placed chain predecessors' ends (plus the cross-gate bound). Chain ends accumulate across passes — a split leaf's early chunks land in earlier passes than the pass that reports scheduled, and successors bound to the LAST chunk. A permanently-failed (TOO_LARGE) leaf publishes a *pass-through* end — the later of its incoming bound and its own partial chunks — so the chain flows from the last real work. A NO_SLOTS / partial-split leaf stays unresolved and holds back its chain successors (retry after expansion).
- **Cross gate (queue/dependency) stays root-level** ([precedenceGate.ts](../utils/calendar-generation/helpers/Scheduler/precedenceGate.ts)): applied to a root's first scheduled leaf; a root's outcome resolves when all leaves contributing to its completion land (a detour target is a tracked root too, so it can be a queue/dependency endpoint). Day caps apply per capped root the leaf belongs to: budgets compose pointwise-min over the caps the block fits, every placement charges every ledger, and a block bigger than one goal's cap is `oversizedLeaf` for that goal only — the other caps keep steering it.

### Split tasks (chunked placement)

A task (or goal leaf) with non-null `Planner.splitting` (`{minMinutes, maxMinutes, maxMinutesPerDay?, minSpacingMinutes?}`, parsed by [utils/taskSplitting.ts](../utils/taskSplitting.ts)) is placed as dynamically sized chunks by [scheduleSplitTask](../utils/calendar-generation/helpers/Scheduler/scheduleSplitTask.ts):

- **Chunk loop.** While minutes remain, run the 5-phase pipeline with a `ChunkSizing`: fit-test at the required minimum, then `grantChunkMinutes` decides the reserved size from the selected slot's real headroom, capped by `maxMinutes` and the remaining day budget. `maxMinutes: 0` is the no-upper-bound sentinel (`SPLIT_MAX_UNLIMITED` / `effectiveMaxChunkMinutes`): chunks are bounded below by `minMinutes` only and grow to fill the slot's headroom. Each chunk rides the pipeline as a synthetic planner clone whose id is the chunk event id (`` `${plannerId}|chunk:${n}` ``, ordinal-keyed) — `plannerIdFromEventId` resolves it back to the row, and travel/buffer handling applies per chunk like any other dynamic placement. The clone's location/category/constraints map entries are copied from the parent row so the chunk doesn't silently default to "Anywhere"/uncategorized/unconstrained — chunks land inside the task's allowed fragments and honor its earliest start.
- **Carving invariant.** The leftover remainder is always zero or ≥ `minMinutes`. A remainder under `2*min` cannot be split, so the only valid chunk is the whole remainder — rule-forced (not slot-driven), applies even in strict mode, may exceed `maxMinutes`, and is recorded as a `maxChunk` relaxation.
- **Per-day cap.** `maxMinutesPerDay` maintains a per-task per-day ledger (seeded from the row's completed segments, so today's finished work counts). The `ChunkSizing.dayBudget` seam makes `selectBestSlot` skip slots on exhausted days. The cap is only relaxed by the final compromise pass (`dayCap` relaxation).
- **Spacing.** `minSpacingMinutes` (optional) holds the next chunk until at least that long after the previous chunk's end — anchor seeded from the latest completed segment too. Default none: chunks sit only the standard placement buffer apart.
- **Composition with goal caps.** When the leaf sits under capped goals (its own root plus any detour host that splices it), the effective day budget is the pointwise min of the task's own budget and every applicable goal budget, and every placed chunk charges every ledger. A goal budget below the required minimum chunk is rule-forced out of the composition for that goal only (no day could ever host the chunk under it) and recorded as an `oversizedLeaf` relaxation on that goal — the remaining caps keep steering.
- **Failure shape.** A chunk that finds no slot returns `fullyPlaced: false` with the placed chunks kept — the outer loop retries the remainder after expansion.

Chunk events are never memoized ([Phase 2](#phase-2--build-initial-event-array)); completed minutes are always derived by summing `completedSegments`. Guarded by [`split-task-scheduling.test.ts`](../__tests__/calendar-generation/split-task-scheduling.test.ts).

### Goal daily cap

A goal root with non-null `Planner.maxMinutesPerDay` has its whole subtree metered against one per-day ledger ([goalDayCap.ts](../utils/calendar-generation/helpers/Scheduler/goalDayCap.ts)) — the split-task day cap one level up, riding the same `ChunkSizing.dayBudget` seam:

- **Seeding.** `seedGoalDayLedger` runs once per goal per run, charging pre-existing subtree events — completed leaves, completed split segments, memoized past events — all of which sit in `context.scheduledEvents` before any dynamic placement, so one scan covers today's history.
- **Plain leaves** place through `wholeBlockSizing`: a fixed grant that returns the full duration when both headroom and day budget allow it, else 0 — the block places whole on a day with room or tries another day; the grant never shrinks it.
- **Split leaves** compose the goal budget with their own per-task budget (pointwise min), charging both ledgers per chunk.
- **Two-tier relaxation.** Scarcity stays strict through horizon expansion and is only relaxed by the final compromise pass (`dayCap`). But a block that can NEVER fit under the cap — leaf duration or minimum chunk > cap — places whole immediately (`oversizedLeaf`); no expansion creates such a day, and holding it strict would starve the loop.
- Budget tests key on the slot's **start** day; a midnight-crossing placement charges each day it touches (split-task parity, via `addIntervalMinutesByDay`).

The day cap applies only to root goal candidates (and detour-target roots), so a stale cap on a retyped or nested row is inert. Guarded by [`goal-day-cap.test.ts`](../__tests__/calendar-generation/goal-day-cap.test.ts).

---

## 7. The Static Travel Pass

[helpers/TravelManager/staticEventTravelPass/](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/) is the state machine that places travel between consecutive non-matching locations across the slot array. It runs once after the initial slot build (`preliminary` pass) and again at the seam after every [expandSlots](#8-incremental-horizon-expansion) call.

### The walk

[staticEventTravelPass.ts](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/staticEventTravelPass.ts) walks the slot array in order with a `while` loop. Handlers return the next index to process, so newly-spliced slots aren't re-processed. Occupied and Travel slots are skipped; Available slots go to [handleAvailable](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/handleAvailable.ts); Category slots go to [handleCategory](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/handleCategory.ts).

### Round-trip detection (`legTracker`)

[legTracker.ts](../utils/calendar-generation/helpers/TravelManager/legTracker.ts) maintains an ordered list of open outbound legs. `track(from, to)` returns:

- **`true`** when the trip closes an open leg (return trip — strict mirror match, or chained-return where `X → A` closes the chain starting at `A`).
- **`false`** when it opens a new leg.

`untrack(from, to)` rewinds a previously opened leg, used by absorb cascades when the dispatcher undoes a placed travel before replanning. Whether `track` returns true or false changes whether the new travel lands at slot-start (return — get back early) or slot-end (outbound — leave at last possible moment) in `handleAvailable`.

`TravelManager.resolveTravel(slot)` and `resolveCategoryEdge(slot, edge)` are the entry points; both call `legTracker.track` internally but only `resolveTravel` uses the return value for placement direction. For category edges, placement is fixed by the edge — `track` is called for round-trip bookkeeping only.

### Handler decisions

**`handleAvailable`** (transitions during free time):

| Situation | Action |
| --- | --- |
| prev === next (no transition) | skip |
| Travel fits in current slot | `placeTravelInCurrent` (start or end per `placeAtSlotStart`) |
| Too small, prev is Travel | `absorbAndReplan` — undo prior travel, merge with current, replan single longer travel at the tail |
| Too small, prev soft + next soft | `bleedAcrossPrevCurrentNext` |
| Too small, prev soft + next hard | `bleedIntoPrev` |
| Too small, prev hard + next soft | `bleedIntoNext` |
| Too small, prev hard + next hard | `fillCurrentWithAlert` (insufficient travel) |

**`handleCategory`** processes two edges per category slot.

- **Entry edge**: if `isFinal` is set, skip — entry was placed during the earlier pass; only the exit edge re-runs at the seam. Otherwise place entry travel at the head; if the slot is too small, `bypassCategoryCascade` walks forward to find a landing point.
- **Exit edge**: if no next slot exists, defer (set `isFinal` for expansion). If the next slot is Available, defer (the Available handler will pick it up). If the next slot is another Category, attempt symmetric-bleed splitting travel across both categories; on failure try backward absorb (`absorbAndReplanIntoNextCategory`), then forward cascade. If the next slot is Occupied, place at tail; if too small, try backward absorb through the category (`absorbAndReplanThroughCategory`) or trespass.

### Absorb / Bleed / Cascade

These are the three space-recovery strategies the handlers reach for when a single slot can't hold the travel.

- **absorb** ([absorb.ts](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/absorb.ts)) — Roll a previously placed travel and the current slot into a single absorb region, untrack the original leg(s) via `legTracker.untrack`, and replan one longer travel covering the merged region. Handles insufficient travel by extending into the next slot's head.
- **bleed** ([bleed.ts](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/bleed.ts)) — Place travel in current, then steal overflow time from soft (Available / Category) neighbors. Cascades when overflow exceeds a single neighbor. Trespass is marked only on **full interior consumption** — a partial bleed shortens the category without marking a boundary.
- **cascade** ([cascade.ts](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/cascade.ts)) — Forward or backward geometric walk to find a landing-spot Category or pinned location. Forward cascade is used when a category entry can't fit (walk past categories until a natural landing). Backward cascade is used for overconstrained category-to-category exits.

### Static-pass invariants (memory-encoded)

These are user-encoded invariants the static pass must respect; check them when modifying handler logic:

- **Overconstrained boundaries must align to original-fabric seams.** The shard model preserves original source boundaries via `originalSourceStart` / `originalSourceEnd`; cascade output should fall on those edges, not invented mid-interval boundaries.
- **Cascade absorbs fill the region with no leading Available.** A cascade-absorbed range becomes a contiguous travel span. Contrast bleed-recovery, which preserves "at origin" Available time where the user genuinely had a window.
- **Restore bleed-trimmed prev category to wrapper.** When a bleed shortens a category, the wrapper is reconstructed via [buildLandingSurvivor](../utils/calendar-generation/helpers/TravelManager/staticEventTravelPass/slotShape.ts) so the renderer sees the full original category.
- **Jump intermediate category as 0-min overconstrained travel when surrounding categories share a location.** [dropUnreachableCategoryVisits](../utils/calendar-generation/helpers/TravelManager/dropUnreachableCategoryVisits.ts) pre-pass replaces an unreachable middle category with a zero-minute `overconstrained` travel at the surrounding location.

### Trespass marking

Trespass flags (`trespassingStart` / `trespassingEnd`) on `CategorySlot` indicate travel-into / travel-out-of that category would have fully consumed its interior. They are set during placement, cleared at the end of each iteration if the marker now sits strictly inside a Travel slot interior (the visible travel already conveys the crossing). Downstream, [stampCategoryEventBorders](../utils/calendar-generation/helpers/EventAssembler/stampCategoryEventBorders.ts) reads these flags and stamps them onto the persisted `CategoryEvent` rows so the renderer can draw red borders without re-running the engine.

### The `isFinal` pickup marker

The last action of every static pass is to mark the last category whose exit edge was deferred (because there was no next slot to place toward) with `isFinal: true`. The pass guarantees at most one slot in the array carries this flag at a time. The marker is the pickup point for the next `expandSlots` call.

---

## 8. Incremental Horizon Expansion

The slot horizon is bounded — initial build covers `HORIZON_CHUNK_DAYS = 28` days regardless of how far out the user has Plans. When the scheduler exhausts slots, [expandSlots](../utils/calendar-generation/helpers/Scheduler/expandSlots.ts) appends another chunk.

### The mechanism

1. **Find the pickup point.** Search for the slot with `isFinal === true` (set by the previous static pass). Pickup time = `isFinal.end`. The marker can only live on a `CategorySlot`, so a fabric with no category slots (no windowed categories, or every window occurrence covered by fixed events) legitimately has none — pickup then falls back to the start of today, nothing is preserved, and the whole region rebuilds (safe: a marker-less fabric holds no committed category-edge decisions).
2. **Compute chunk bounds.** `chunkEnd = endOfDay(chunkBase + HORIZON_CHUNK_DAYS - 1)`, where `chunkBase` is **always the current horizon end** (`deriveSchedulingHorizon`). Anchoring to the marker pickup instead would stall the horizon whenever an expanded region has no category slot to mark: `markLastCategoryAsFinal` re-flags a category back in the preserved region, so the pickup stops advancing and the same chunk rebuilds forever (the marker-less fabric hits the identical trap — growing from the fallback pickup of today). Growing from the horizon end always advances; the new region still *starts* at `pickupTime`, so preserve/resume is unchanged and only the chunk's forward reach differs. Guarded by [`expansion-without-categories.test.ts`](../__tests__/calendar-generation/expansion-without-categories.test.ts).
3. **Split the slot array.** Everything ending ≤ `pickupTime` is preserved verbatim (`preservedSlots`); everything after is discarded. The static pass's decisions on preserved slots are retained — they are not re-processed.
4. **Compute `startingLocationOverride`.** From the last preserved slot's outgoing location, so the freshly-built region's seam Available starts with an honest `prev`.
5. **Rebuild the new region.** Call `buildAvailableSlots({ startDate: pickupTime, ..., startingLocationOverride })` over the new chunk window.
6. **Combine and sort.** `[...preservedSlots, ...newSlots]`.
7. **Replay `legTracker` state.** Reset the tracker, then walk preserved Travel slots and call `legTracker.track(from, to)` once per **unique** `travelId` (skipping self-travels where `from === to`). This restores round-trip detection state so the seam re-decision behaves correctly.
8. **Resume the static pass.** Call `staticEventTravelPass` with `resumeIdx = index of isFinal slot in combined array` (or `0` if no marker existed). The pass picks up at exactly the deferred exit edge and proceeds across the new region. On completion it marks a fresh `isFinal` on the new last-deferred category.

### Why the tail buffer

`PLACEMENT_BUFFER_DAYS = 3` of trailing horizon room is left empty — `findAllFittingSlots` filters out slots starting past `lastPlaceableSlotEnd − PLACEMENT_BUFFER_DAYS`. This gives the next expansion's static-pass resume **empty room** to re-decide travel placement at the seam without colliding with already-placed dynamic events.

### Why proactive expansion matters

Without the proactive watermark check, the scheduler would burn iterations on leaves that can't possibly fit before triggering reactive expansion. Detecting "biggest remaining leaf > biggest compatible slot" before the forward pass starts cuts straight to the expansion step. The comparison sizes each remaining leaf by `placementBlockMinutes` (a split leaf as its required minimum chunk); leaves whose chain predecessors or cross gate are still blocked are excluded (they can't use an expansion until they unblock). The flat scheduler retired the old goal-aggregate sizing that pinned the watermark permanently true. The watermark must also resolve category constraints against the same window-bearing category set placement uses (`scheduledCategories`): a classification-only category (no time windows) is unconstrained at placement, and treating it as constraining here demands category slots that can never exist — the loop then spends its whole expansion budget on watermark `continue`s and the placement walk never runs.

### Regression coverage

These tests live in [`__tests__/calendar-generation/`](../__tests__/calendar-generation/) (the full engine-test index is in CLAUDE.md's Tests section):

- [`expansion-seam.test.ts`](../__tests__/calendar-generation/expansion-seam.test.ts) — guards the `CategoryEvent` ID format (`` `${categoryTimeWindowId}|${YYYY-MM-DD-local}` ``) by running `generateCalendar` with a single Plan three weeks out (which forces expansion) and asserting that every produced `CategoryEvent` ID matches the local-date pattern. The diff layer and the DB schema depend on this composite ID; a regression to UTC-instant keying would diverge near midnight UTC and would be caught here.
- [`ready-goal-watermark.test.ts`](../__tests__/calendar-generation/ready-goal-watermark.test.ts) — guards the three watermark starvation modes: a ready root goal must place every leaf even when the subtree aggregate exceeds any slot, when its `categoryId` names a windowless (classification-only) category, and when a memoized past leaf would otherwise inflate the goal's effective size.
- [`ready-gate.test.ts`](../__tests__/calendar-generation/ready-gate.test.ts) — guards the Phase 9 readiness gate as the universal scheduling gate: a NOT-ready goal's subtree schedules nothing, a ready standalone task places, and a NOT-ready standalone task does not.
- [`completed-task-not-rescheduled.test.ts`](../__tests__/calendar-generation/completed-task-not-rescheduled.test.ts) — guards the Phase 9 completed-task filter: a completed task under a ready goal renders exactly once, at its completion window, and never re-enters the scheduler.
- [`category-window-recurrence-exceptions.test.ts`](../__tests__/calendar-generation/category-window-recurrence-exceptions.test.ts) — guards `expandCategoryWindowPeriods`: deleted occurrences vacate both the CategoryEvents and the slot fabric, moved occurrences keep their original-date id while relocating placement, and a move across the horizon seam emits exactly once (containing-range rule). The seam case leaves one window fragment uncovered so the marker-based pickup path is the one exercised.
- [`expansion-without-categories.test.ts`](../__tests__/calendar-generation/expansion-without-categories.test.ts) — guards the marker-less growth path: with zero CategorySlots there is nothing for `markLastCategoryAsFinal` to stamp, so the chunk base must derive from the current horizon end rather than the fallback pickup (today) — otherwise expansion rebuilds the same chunk forever and an overflow task fails `NO_SLOTS` instead of placing past day 28.
- [`external-busy-blocks.test.ts`](../__tests__/calendar-generation/external-busy-blocks.test.ts) — guards the external-busy-fabric merge: imported external-calendar events (resolved through the real `deriveExternalBusyEvents` + mode/exception path) carve the free-slot fabric like fixed events so tasks are pushed off busy windows, while `assembleFinalEventList` keeps them out of the persisted `events` output.

All but the seam, window-exception, and marker-less-expansion tests run against a trimmed live-data snapshot in `fixtures/` — hand-built minimal fixtures rarely produce a valid slot fabric and fail silently, so new full-pipeline tests should extend the fixture pattern. Deliberate exceptions exist where the test's specific geometry demands hand-built inputs (the seam/window/cascade tests plus [`split-task-scheduling.test.ts`](../__tests__/calendar-generation/split-task-scheduling.test.ts), [`goal-day-cap.test.ts`](../__tests__/calendar-generation/goal-day-cap.test.ts), and [`scheduling-constraints.test.ts`](../__tests__/calendar-generation/scheduling-constraints.test.ts)); the full engine-test index lives in CLAUDE.md's Tests section.

---

## 9. Capacity Gating & Placement Buffer

### `effectiveCapacityBreakdown`

[capacityCheck.ts](../utils/calendar-generation/helpers/Scheduler/capacityCheck.ts) computes the largest single duration a task could ever fit in a **clean week** (i.e. before any other tasks consume slots), accounting for:

1. **Template gaps** — `gapIntervalsForDay` produces each day's free intervals (between templates).
2. **Strict-category subtraction** — strict categories the task is **not** eligible for (not in its window-cascade set) subtract from any gap they overlap (the task can never use them).
3. **Per-category ceiling** — if the task is window-constrained, the largest window across all categories it is eligible for (own + non-confined ancestors) is a hard ceiling.

Returns `{ categoryCeiling, largestGap }` as two separate facts (rather than their min) so the composed gate can attribute which one bound the leaf. Cached per `taskCategoryId ?? "anywhere"` for the duration of a scheduling pass.

`placeLeaf` resolves the leaf's full structural ceiling through `leafStructuralCapacity` (same module): the min of the `effectiveCapacityBreakdown` facts, the allowed-times ceiling (`maxAllowedBlockMinutes` — the exact longest contiguous block a generic week offers under the constraint chain, measured on a two-week unroll so blocks chaining across midnight and the week seam count; the per-task value stays outside the category-keyed cache), and the true weekly intersections. Which candidate won is recorded as `limitingAxis` (`templateGaps | categoryWindow | allowedTimes | allowedTimesWindows | templateIntersection`, ties to the earlier/simpler axis) and rides the `TASK_TOO_LARGE` payload, so the console renderer can name the exact constraint — including which ancestor contributed inherited allowed times and which categories' windows applied — instead of a generic "largest gap" line. `maxConstrainedBlockMinutes` takes the exact allowed × eligible-window intersection — the min of independent ceilings cannot see disjoint patterns (windows Monday, allowed times Tuesday) — and a structurally empty intersection permanently fails the leaf as `IMPOSSIBLE_CONSTRAINTS` (a `TASK_UNSCHEDULABLE` message) while a small one tightens `maxCapacity`; it is skipped when an eligible window carries per-occurrence exceptions, since a moved occurrence can land inside the allowed times. `maxTemplateConstrainedBlockMinutes` then folds the week's template structure into both remaining axes (run whenever the leaf carries allowed times OR eligible windows): the largest contiguous fragment of (template-free gaps ∩ allowed times ∩ eligible windows) over the sampled week, minus the trailing buffer the fit-test demands inside the same fragment. Every pair of axes can look roomy while the combined fragment never hosts the block: a 4h task allowed 09:00–17:00 in a week whose largest 09–17 gap is 4h fails by the buffer margin alone; category windows fully covered by templates leave the largest-window and largest-gap ceilings untouched; and the full three-way case (windows Mon+Tue mornings, allowed days Mon+Wed, a template covering Monday morning) keeps every pairwise projection non-empty while no instant satisfies all three — each would otherwise burn the whole expansion budget as transient `NO_SLOTS`, starving everything queued behind it. Per-day sampling cannot see fragments chaining across midnight, so every guard errs toward a larger ceiling: an overnight allowed range drops the allowed axis, an overnight eligible window drops the window axis (no axis left ⇒ check skipped), and a template whose per-occurrence exceptions can touch a day the remaining axes care about skips the check (a vacated occurrence can open room on a specific date the sampled week cannot see); exceptions on templates confined to irrelevant days keep the gate active. Guarded by the "x template structure" describes in [`scheduling-constraints.test.ts`](../__tests__/calendar-generation/scheduling-constraints.test.ts). If the required block exceeds `maxCapacity`, the task is marked `TOO_LARGE` immediately — no iterations wasted attempting placement, and no expansion budget burned hunting for a fragment that cannot exist. The required block is the full duration for a plain task, but only the required **minimum chunk** for a split task (`minChunkRequired` of the run's remainder) — a split task is `TOO_LARGE` only when not even one minimum chunk fits anywhere.

### `largestCompatibleSlotForLargestTask`

Same module, used by the proactive expansion check. Walks the slot array and returns the largest currently-existing slot the caller-supplied biggest remaining leaf could land in, honoring category strictness and the `placementCutoffDate`. The biggest remaining leaf is selected once per outer-loop iteration in `scheduleTasksAndGoals` by `placementBlockMinutes` (same module) over the unblocked leaves and shared with the watermark comparison — a split leaf sizes as its required **minimum chunk**, never the full remainder. The sizing loop filters each candidate leaf through the full `leafStructuralCapacity` ceiling (cached per leaf id for the run), not the bare per-category breakdown — a leaf destined for the `TOO_LARGE`/`IMPOSSIBLE_CONSTRAINTS` gate must never become the watermark's biggest leaf, or its never-materializing compatible slots keep `biggestFit < biggestRemaining` true and burn the whole expansion budget before the gate fires. Category eligibility is resolved through `categoryEligibilityMap` and intersected with the caller-supplied `schedulableCategoryIds` (the window-bearing categories), so the watermark agrees with `findValidSlots` about which windows a subcategory item may cascade into.

---

## 10. Strategies

[helpers/Scheduler/selectBestSlot.ts](../utils/calendar-generation/helpers/Scheduler/selectBestSlot.ts) scores slots via a single composite strategy.

### The interface

```typescript
interface SchedulingStrategy {
  readonly name: string;
  score(task: Planner, slot: PlaceableSlot, context: SchedulingContext): number; // 0.0–1.0
}
```

`PlaceableSlot = AvailableSlot | CategorySlot` — strategies never score Occupied or Travel slots.

### `CompositeStrategy`

[SchedulingStrategy.ts](../utils/calendar-generation/strategies/SchedulingStrategy.ts) holds an array of `{ strategy, weight }` pairs. `score` returns the weighted mean. `getDetailedScores` returns per-strategy raw values for debugging.

### Built-in strategies

- **`EarliestSlotStrategy`** ([EarliestSlotStrategy.ts](../utils/calendar-generation/strategies/EarliestSlotStrategy.ts)) — Linear decay: `score = max(0, 1 - daysFromNow / 14)`. Task-independent. Day 0 → 1.0, Day 14+ → 0.0.
- **`LocationGroupingStrategy`** ([LocationGroupingStrategy.ts](../utils/calendar-generation/strategies/LocationGroupingStrategy.ts)) — Examines the slot's `prevLocationId` / `nextLocationId` (or `currentLocationId` for `CategorySlot`) and applies a base sandwich-match score plus a travel-time penalty when locations don't match.

### Default constants (verbatim from [strategies/defaultStrategy.ts](../utils/calendar-generation/strategies/defaultStrategy.ts))

```typescript
DEFAULT_STRATEGY_WEIGHTS = {
  earliestSlot:     1.0,
  locationGrouping: 0.2,
};

DEFAULT_LOCATION_GROUPING_SCORES = {
  bothMatch:       0.95,  // both adjacent events match task location (sandwich)
  oneMatchOneOpen: 0.8,   // one end matches, other is open (start/end of day)
  oneMatch:        0.5,   // one end matches, other doesn't
  bothOpen:        0.7,   // both ends open (empty day)
  oneOpenNoMatch:  0.45,  // one end open, other doesn't match
  neitherMatch:    0.4,   // neither adjacent event matches
  noLocation:      0.5,   // task has no location (neutral)
};

DEFAULT_LOCATION_GROUPING_PENALTIES = {
  maxSingleTravelPenalty:     0.02,
  maxDoubleTravelPenalty:     0.03,
  singleTravelPenaltyDivisor: 600,   // penalty = travelMinutes / 600 (capped)
  doubleTravelPenaltyDivisor: 400,
};
```

### Strategy assembly

[buildSchedulingStrategy.ts](../utils/calendar-generation/helpers/CalendarGenerator/buildSchedulingStrategy.ts) always includes `EarliestSlotStrategy`. `LocationGroupingStrategy` is added only if a `travelTimeMatrix` was supplied. Weights default to `DEFAULT_STRATEGY_WEIGHTS` but can be overridden per call.

> Note: task urgency / deadline prioritization is **not** a strategy. Scores are computed once at the top of `CalendarGenerator.generate()` via `scoreCandidatesAndRootGoals` and consumed by `sortByPriorityAndConstraints` before any slot scoring.

---

## 11. The Shard Model & Identity-Based Absorb/Reclaim

[utils/timeSlotUtils.ts](../utils/calendar-generation/utils/timeSlotUtils.ts) implements the engine's identity-based travel manipulation.

### Why shards exist

A single logical travel can span multiple source slots (a bleed across prev-current-next produces three pieces — one per eaten source). Fusing them into a single `TravelSlot` would erase the original source identities, breaking restoration when the travel is later absorbed or reclaimed. Instead, each piece is emitted as its own `TravelSlot` shard sharing a common `travelId` (UUID).

### Shard fields

Each shard carries:

- **`travelId`** — UUID shared by all shards of one logical travel.
- **`originalType`** — `"available"` or `"category"` — the source kind.
- **`originalSourceStart`** / **`originalSourceEnd`** — the original fragment's boundaries before splicing.
- For category shards: **`originalCategoryId`**, **`originalLocationId`**, **`originalIsStrictCategory`**.
- For available shards: **`originalPrevLocationId`**, **`originalNextLocationId`**.

### Core operations

- **`createTravelShards(sources, ...)`** — given source fragments, produce N `TravelSlot`s with a shared `travelId` and the appropriate `original*` fields.
- **`collectShardSources(absorbedRange)`** — extract `ShardSource`s from an absorbed range, clipped to the absorb boundary; chained absorbs inherit `originalType` from existing shards.
- **`unplanTravel(slots, travelId)`** — remove all shards of a `travelId` and restore source fragments via `restoreShardSource`; adjacent restored siblings (Available↔Available, Category↔Category with same category/location) are merged.
- **`restoreAbsorbedRange(slots, start, end)`** — reconstruct Available/Category fragments inside `[start, end]`, recursively unpacking any travel shards there to their original sources. Used by `reserveSlotWithTravel` after splicing a placement into an absorbed region.
- **`reclaimTravelSlot(slot)`** — convert a `TravelSlot` back to a `PlaceableSlot` of the original kind (CategorySlot if `originalType === "category"`, else AvailableSlot).
- **`TravelShardSpan`** — `{ travelId, spanStart, spanEnd, shardIndices }`. Returned by `findAdjacentTravel*` and `findPrecedingGapTravel`; carries everything `reserveSlotWithTravel` needs to remove the span by identity.
- **`removeTravelSpanByTravelId` / `removeTravelSpanAt`** — safe multi-shard removal.

### Why identity-based removal matters

Earlier versions of the engine searched for adjacent travel by time-window heuristics. That broke when multi-shard travels straddled the heuristic boundary, when buffer offsets shifted positions, or when two unrelated travels happened to fall near the same time. Identity removal (carry the `TravelShardSpan` through `SlotSelectionResult`, remove all shards of that `travelId` in `reserveSlotWithTravel`) eliminates the entire class of false-positive removals.

The same pattern applies to inbound/outbound travel removal in the dynamic path: pre-existing travels are matched by exact end-position (`occ.end === task.start` for inbound, `occ.end === slot.end` for outbound) rather than by tolerance window.

---

## 12. Category System

A `Category` is a hierarchical organizational container with four engine-relevant attributes:

- **`timeSlots: CategoryTimeWindow[]`** — `[{ day, startTime, endTime, ... }]`. Day uses ISO weekday numbers (`0 = Sunday`, `1 = Monday`, ...).
- **`isStrict: boolean`** — if `true`, only items that are **members** of this category can be scheduled in its windows. Other items are filtered out by `findAllFittingSlots` and by `effectiveCapacityBreakdown`'s strict-category subtraction. Membership is hierarchical (see below), so a strict `work` window still admits a `project` item.
- **`confineToOwnWindows: boolean`** — if `true`, this category's items schedule only in its own windows (no upward cascade), and it caps any descendant climbing the chain. Default `false`.
- **`locationId: string | null`** — default location for items inside the category that don't carry one explicitly. Inherited via `LocationMapper` as the third fallback (after own location and parent chain).

A category only contributes to scheduling geometry if `useTimeWindows === true` **and** `timeSlots.length > 0` (filtered in `CalendarGenerator`'s constructor). Categories that fail either check still contribute location inheritance.

### Hierarchical membership (window cascade)

An item is a member of its effective category **and every ancestor**, so a `project` (nested under `work`) item may occupy a `work` window — but a plain `work` item never lands in a `project` window (descendant, not ancestor). [buildCategoryEligibilityMap](../utils/calendar-generation/helpers/CalendarGenerator/buildCategoryEligibilityMap.ts) (Phase 4) computes, once per pass from the full category list, `categoryId → Set<eligible categoryId>` — the category itself plus non-confined ancestors, climbing until (and including) the first `confineToOwnWindows` ceiling or the root. It rides in `SchedulingContext.categoryEligibilityMap`.

The three match sites test set membership instead of id equality:

- `findAllFittingSlots` / `findValidSlots` — a window-constrained task (its eligible set intersects the window-bearing categories) only accepts category slots whose `categoryId` is in the eligible set; otherwise it's unconstrained (Available + non-strict) exactly as before.
- `effectiveCapacityBreakdown` — the per-category ceiling is the largest window across all eligible window-categories, and strict-category subtraction skips any strict category the task is eligible for.
- `largestCompatibleSlotForLargestTask` — the proactive-expansion watermark mirrors the same eligible-set predicate.

### Materialization

Each generation, `buildCategoryEvents` materializes one `CategoryEvent` row per `CategoryTimeWindow` per matching local day across the horizon, expanding through `expandCategoryWindowPeriods` (per-occurrence exceptions applied — deleted occurrences produce no row, moved ones carry the override in `start`/`end`). IDs are composite (`` `${windowId}|${YYYY-MM-DD-local}` ``), keyed on the **local** calendar date of the ORIGINAL rule-derived occurrence — not the UTC instant, and not the override date — so day boundaries near midnight UTC don't desync the diff layer and a moved occurrence keeps its identity. `stampCategoryEventBorders` propagates trespass flags from category slots and insufficient-travel slots onto these rows (containment-based, so moved occurrences stamp correctly).

---

## 13. Debugging the Engine

The engine has a built-in switchboard at [calendarGeneration.ts:114–130](../utils/calendar-generation/calendarGeneration.ts#L114-L130). Set `enableLogging = true` and flip individual flags:

| Flag | What it dumps |
| --- | --- |
| `metrics` | Final `SchedulingMetrics` |
| `failures` | All `SchedulingFailure` rows |
| `finalEvents` | The final `SimpleEvent[]` |
| `leanCalendar` | Sorted output events with title / start / end / location — the most readable single dump |
| `travelDebug` | Travel pass diagnostics |
| `templateInfo` | Template expansion stats |
| `planners` / `templates` / `locations` | Echo of input |
| `strategySettings` | Active strategy weights / scores / penalties |
| `staticEventTravelPass` | Per-slot decision/action trail of every static pass (preliminary plus each `resume@<date>` expansion) — set via [TravelPassRecorder](../utils/calendar-generation/helpers/TravelManager/TravelPassRecorder.ts), formatted via [travelPassMessages](../utils/calendar-generation/helpers/TravelManager/travelPassMessages.ts) |
| `dynamicScheduling` | Per-task decision/action trail of every dynamic placement — set via [SchedulerRecorder](../utils/calendar-generation/helpers/Scheduler/SchedulerRecorder.ts), formatted via [schedulerMessages](../utils/calendar-generation/helpers/Scheduler/schedulerMessages.ts). A `COMPACT` constant in [loggingUtils.ts](../utils/calendar-generation/utils/loggingUtils.ts) (default `true`) prints only task headers + outcomes — one screenful per regen instead of a slot-dump avalanche; flip it off for the full decision/action/end-state trail on a task under investigation |
| `dateRangeStart` / `dateRangeEnd` | Inclusive bounds applied to event-based dumps (`finalEvents`, `leanCalendar`, `travelDebug`) and the recorder trails. Either can be `null` to leave that side open. |

When investigating a misplaced travel block or a task that ended up in the wrong slot:

1. Set `enableLogging = true`.
2. Enable `leanCalendar` to confirm the symptom.
3. Enable `staticEventTravelPass` (for travel placement bugs) or `dynamicScheduling` (for task placement bugs).
4. Use `dateRangeStart` / `dateRangeEnd` to narrow output to the affected day or two.
5. Read the trail. Each recorder entry includes the decision branching, actions taken, and an end-state snapshot of the relevant slots.

[RecorderBase.ts](../utils/calendar-generation/utils/RecorderBase.ts) provides shared formatting (date stamps, slot labels, marker decoration); both recorders extend it.

---

## 14. Engine-Internal Utilities

[utils/](../utils/calendar-generation/utils/):

- **`dateTimeService.ts`** — centralized date helpers (week boundaries, day comparison, minute math, ISO parse/format, range overlap, day-key generation). **The engine should not call `date-fns` directly outside this file.**
- **`intervalUtils.ts`** — `findGaps` (Occupied intervals → Available slots with `prev`/`next` location), `eventsToIntervals`, `masksToIntervals`, `mergeIntervals`, `findLocationTransitions`, `detectTrespassingEvents`. `masksToIntervals` applies per-occurrence template exceptions (`PerTemplateMask.recurrenceExceptions`, from `EventTemplate.recurrenceExceptions`): for each matching day it computes the occurrence key and skips a `deleted` occurrence or re-times a `moved` one (same duration). This is the single place template time enters the slot fabric — the SimpleEvents from `expandTemplates` are filtered out of both the slot build and final `events`. The "clean week" capacity heuristics (`gapIntervalsForDay`, `calculateLargestGap`) stay exception-unaware by design — they model the typical week's ceiling, which a one-off move/skip shouldn't move.
- **`loggingUtils.ts`** — `logCalendarDebugInfo` dispatcher and `filterEventsByLogRange` (open-bounded filter — `null` on either side leaves it open).
- **`RecorderBase.ts`** — base class for `TravelPassRecorder` + `SchedulerRecorder`.
- **`timeSlotUtils.ts`** — the shard model (Section 11). Also `getDurationMinutes`, `canFitDuration`, `doSlotsOverlap`, `splitSlot`, `occupySlot`, `createTravelSlot`, `isTravelSlot`.

---

## 15. Complete Data Flow

```
generateCalendar(...)
   │
   ▼
CalendarGenerator.generate()
   │
   ├─ (1)  validateInput                       → fail-fast on bad input
   ├─ (1b) scoreCandidatesAndRootGoals         → urgency scores (candidates + root goals)
   ├─ (2)  buildInitialEventArray              → memoized + plan + completed events
   ├─ (3)  expandTemplates                     → recurring events + PerTemplateMask[]
   ├─ (3b) merge externalBusyEvents → fabricEvents (carved around, filtered out at assembly)
   ├─ (4)  buildLocationMap + buildPlannerCategoryMap
   │       + buildCategoryEligibilityMap + buildPlannerConstraintsMap
   │       + buildPrecedenceEdges + buildPredecessorMap + computeEffectiveScores
   ├─ (5)  filter scheduledCategories          (useTimeWindows + timeSlots.length > 0)
   │
   ├─ (6a) buildAvailableSlots                 → initial 28-day slot array
   ├─ (6b) staticEventTravelPass               → preliminary travel placement; marks isFinal
   ├─ (6c) dropPastAvailableSlots              → strip Available slots ending ≤ now
   │
   ├─ (7)  construct SchedulerRecorder
   ├─ (8)  prepareSchedulingContext
   ├─ (9)  prepareCandidates                   → priority-sorted task/goal list
   │
   ├─ (10) Scheduler.scheduleTasksAndGoals
   │         │
   │         ▼
   │       create SplitPlacementState + GoalCapState (shared across iterations)
   │       leaf pool + edges: buildLeafGraph (spliced sequences, chain edges, leafEffScore)
   │       loop while the pool is non-empty (expand on demand; stop when stuck or at MAX_HORIZON_EXPANSIONS):
   │         resolve zero-leaf candidates through their cross gate (bound carried forward)
   │         compute placementCutoffDate
   │         proactive expansion check (watermark / biggest-leaf-block vs largest-compatible-slot)
   │           → if needed: expandSlots → continue
   │         forward pass:
   │           for each ready leaf in (constrained desc, leafEffScore desc, scheduleIndex asc) order:
   │             placeLeaf (chain preds resolved + cross gate open)
   │               → scheduleTask: validate → findValid → selectBest → reserve → buildEvent
   │               → split leaves: scheduleSplitTask chunk loop (ChunkSizing)
   │               → capped roots: per-day ledgers via ChunkSizing.dayBudget (min over fitting caps;
   │                 all caps charged; oversized decided per cap)
   │             collect resolved ids; remove after the pass
   │         if leaves remain → expandSlots (reactive backstop)
   │           (unless nothing even attempted: precedence deadlock → force-fail missing gates)
   │       final compromise pass (day caps relaxed; compromises recorded)
   │       leftover roots at budget exhaustion → loud NO_SLOTS failures (one per structural root)
   │
   ├─ (11) deriveSchedulingHorizon → assembleFinalEvents
   │         → events, categoryEvents, travelEvents
   │
   ├─ (12) buildEngineMessages                  → failures + relaxations + travel
   │         → EngineMessage[] (dismissed carried forward by id)
   │
   └─ emitDebugLog (if logging enabled)
```

---

## 16. Key Gotchas & Edge Cases

- **The slot array is the truth.** Never compute placement from a separate "free time" cache. Always read from `TimeSlotManager.slots` after each splice.
- **Travel is shards, not slots.** When manipulating a logical travel, work via `travelId`. Don't search adjacent slots by time window — use `findAdjacentTravel*` / `findPrecedingGapTravel`, which return `TravelShardSpan` and let `reserveSlotWithTravel` remove by identity.
- **Buffer is owned by the unit, not the slot.** Each dynamic placement owns its own leading + trailing buffer. Travel sits flush against the task; the buffer is outside the `[travel-before, task, travel-after]` unit on both sides.
- **Standalone-before changes leading buffer ownership.** When travel-before fits in an earlier slot, the leading buffer is owned by that earlier slot — the task lands flush at `slot.start` in the current slot.
- **`null` locationId means "Anywhere", not "missing".** Travel propagates through Anywhere events instead of ending at them. Strategy scoring and travel placement honor this.
- **`isFinal` is a single-instance marker.** At most one slot carries it. If you see two, something is wrong.
- **`legTracker` must be replayed at the seam.** Without replay, round-trip detection in the expanded region treats every leg as new outbound. Replay deduplicates multi-shard travels by `travelId` and skips self-travels.
- **Category membership is hierarchical.** An item is a member of its effective category and every non-confined ancestor (see [Section 12](#12-category-system)). Match sites test the eligible-set (`categoryEligibilityMap`), not id equality — a `project` item may occupy a `work` window, a `work` item may not occupy a `project` window, and `confineToOwnWindows` opts a subcategory out of the cascade.
- **Strict category subtraction in `effectiveCapacityBreakdown`.** A strict category the task is **not eligible for** blocks the entire window it overlaps, even if the window has free interior. The capacity check must subtract these; strict categories the task *is* eligible for (an ancestor it cascades into) are not subtracted.
- **Per-category ceiling.** A window-constrained task can never exceed the largest window across the categories it is eligible for, regardless of template gaps.
- **`placementCutoffDate` suppresses dynamic placement in the tail.** Don't try to "use the whole horizon" — leave the last `PLACEMENT_BUFFER_DAYS` empty so the next seam re-decision has room.
- **`useTimeWindows + timeSlots.length > 0` is the scheduling gate.** A category missing either still contributes location inheritance but does not constrain slot geometry.
- **CategoryEvent ID is local-date keyed.** `` `${windowId}|${YYYY-MM-DD-local}` ``. Never derive the date component from the UTC instant — the diff layer assumes local. See [`expansion-seam.test.ts`](../__tests__/calendar-generation/expansion-seam.test.ts).
- **Template events are filtered out of `events`.** They're consumed by the slot builder (as `PerTemplateMask[]`), not surfaced in the final `SimpleEvent[]`. The renderer reads recurring template instances separately.
- **External busy blocks are fabric-only.** `options.externalBusyEvents` (`eventType: external`) are merged into the fixed-event fabric (`fabricEvents`) after template expansion so the slot carve and every horizon expansion treat imported-calendar commitments as occupied time — but `assembleFinalEventList` filters them out of the returned `events`. They are never memoized and never synced; they live in `ExternalEvent` rows owned by the refresh path, and the calendar renders them separately as a read-only overlay.
- **Trespass flags propagate from slots to `CategoryEvent` rows.** Don't compute trespass in the renderer — the engine writes it via `stampCategoryEventBorders` so cold loads render correctly.
- **Urgency is not a strategy.** Strategy weights affect *slot scoring* only. Urgency scores are computed once at the top of `CalendarGenerator.generate()` (via `scoreCandidatesAndRootGoals`, which also covers non-candidate root goals so the dashboard can rank them) and consumed by `sortByPriorityAndConstraints` before any strategy runs. The same map is returned as `plannerScores`.
- **Absorb/reclaim removal and slide are separate decisions.** Removing a redundant travel leg is always correct for a same-location follow-up — a constrained task must never pay a fictional round trip just because its bounds exist. Only the **slide** (back-extending the task into the freed span) can violate a bound, so `selectBestSlot` validates it per candidate: the slid task start must be `>= effectiveAfter` (afterTime chain / earliest date, applied to unconstrained tasks too — a queue-bounded successor must not slide below its gate bound) and must sit in the same allowed interval as the candidate (checked via `intersectIntervalWithAllowed`). On failure the placement carries `slideIntoFreedTravel: false`: the leg is still removed, the task keeps the candidate's clipped start, the freed span becomes plain free time (a visible pad — dead space beats fictional commutes), and the span adds no capacity bonus. Guarded by the "travel coalescing under constraints" tests in [`scheduling-constraints.test.ts`](../__tests__/calendar-generation/scheduling-constraints.test.ts).
- **Chunk events are never memoized.** `buildMemoizedEvents` excludes split planners entirely — an uncompleted past chunk must vanish so its minutes reschedule; the frozen past is the row's `completedSegments`, re-emitted fresh each regen.
- **Day budgets key on the slot's start day, but charges split at midnight.** `ChunkSizing.dayBudget(slotStart)` tests the local day the slot starts on; a midnight-crossing placement charges every day it touches (`addIntervalMinutesByDay`). Keep both sides of that seam consistent when extending cap logic.
- **Day caps are two-tier.** Scarcity (no room left today) stays strict through horizon expansion and only relaxes in the final compromise pass. Impossibility (block or minimum chunk larger than the cap) relaxes immediately — no expansion creates such a day, and staying strict starves the loop.
