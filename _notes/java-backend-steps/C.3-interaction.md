# C.3 Interaction + edit

**Status:** DONE 2026-11-26 -- Phase C (third step) -- cross-cutting context in
[0.0a.java-backend-plan.md](0.0a.java-backend-plan.md)

## What was built

### calendar-core/interaction/ -- headless drag state machine

Framework-free TS, no React, no FullCalendar, no DOM references.

1. **types.ts** -- normalized pointer event (`{phase, x, y, time}`), grid metrics
   the renderer provides, drag kinds (move/resize-start/resize-end/create), the
   five-phase state machine type (idle/pending/dragging/committed/cancelled),
   drag preview geometry, allow hook signature, mutation delta types, machine
   configuration.

2. **dragMachine.ts** -- pure functional state machine:
   - `transition(state, pointerEvent, metrics, config, targetEvent, targetKind)`
     returns the next state plus timer instructions (start/cancel); the caller
     owns `setTimeout` and scroll implementations.
   - `confirmLongPress(state, config)` -- called when the long-press timer fires;
     transitions from pending to dragging with the allow hook evaluated.
   - `cancel(state)` -- force cancel from any phase (Escape, scroll interruption).
   - `reset()` -- return to idle from committed/cancelled.
   - `computePreview(state, event, kind)` -- the preview geometry for the
     renderer to draw during a drag.
   - Pending phase cancels when pointer movement exceeds `moveThreshold` (the
     touch turned into a scroll).

3. **mutations.ts** -- delta computations between two hit-test results, rewriting
   FullCalendar's `computeEventMutation` / `computeMutation` /
   `joinHitsIntoSelection` (interaction/index.js ~L1201, ~L1523, ~L1716):
   - `computeMoveDelta(startHit, endHit)` -- day offset + minute offset.
   - `computeResizeDelta(startHit, endHit, edge)` -- duration delta for
     start-edge or end-edge resize.
   - `computeCreateRange(startHit, endHit)` -- normalized range from a
     create-by-drag gesture.

4. **autoScroll.ts** -- `autoScrollSpeed(pointerY, viewportHeight, edgeZone,
   maxSpeed)`: a pure speed curve that ramps linearly from 0 at the edge zone
   boundary to maxSpeed at the container edge. Modeled on FullCalendar's
   AutoScroller. The renderer applies the returned speed to its scroll
   container; the core never scrolls.

### calendar-core/edit/ -- decideEdit + pendingEdit

1. **types.ts** -- `EditKind` (move/resize/delete), the `EditDecision` union
   (DirectApplyResult / OccurrenceApplyResult / AskScopeResult / RejectResult),
   `PendingEdit` state type, `rangeAllowed` validation helper (end > start and
   at most 24h, matching the existing `rangeAllowed` in WeekStructureModal).
   Both apply and askScope results carry `OccurrenceInfo` (entityId,
   entityTitle, occurrenceKey, entityType) so callers never need to re-resolve.

2. **decideEdit.ts** -- `decideEdit(event, editKind, context, preStart?)`:
   - Template events: resolve occurrence via context, check hasMovedException --
     already-customized returns apply/single with occurrence data, otherwise
     askScope.
   - Planner events: resolve plan occurrence via context, check isRecurring and
     hasMovedException -- same branching as templates, plus a direct-apply path
     for non-recurring/non-occurrence planners.
   - Category/travel/external: reject.
   - Non-editable events: reject.
   - `EditContext` interface: four callback functions the caller injects
     (hasMovedException, planIsRecurring, resolveTemplateOccurrence,
     resolvePlanOccurrence). No React, no FullCalendar imports.

### Calendar.tsx -- five scope branches collapsed

The four template scope branches (onEventResize, onEventDrop, onDelete,
onEditTimes) and the plan occurrence branch (onEventDrop) each previously:
1. resolved the occurrence
2. found the template/plan row
3. checked `hasMovedException`
4. applied directly or showed the scope modal

Now each branch:
1. builds a minimal `CalendarEvent` stub and an `EditContext` from the refs
2. calls `decideEdit`
3. handles the result (apply/askScope/reject)

Behavior is identical: same prompts shown at the same times, same skips when
already customized, same reverts on scope-cancel. The five branches shrank from
~120 lines of duplicated logic to ~60 lines of uniform result handling.

Two helper functions were added above Calendar (outside the component, stable):
- `stubCalendarEvent` -- builds a minimal CalendarEvent from EventImpl fields.
- `buildEditContext` -- builds an EditContext from templateRef and plannerRef.

## Barrel exports

- `@circadium/shared/calendar-core/interaction` -- sibling barrel at
  `calendar-core/interaction.ts`, re-exports everything from `interaction/`.
- `@circadium/shared/calendar-core/edit` -- sibling barrel at
  `calendar-core/edit.ts`, re-exports everything from `edit/`.

Both follow the existing `{'./*': './src/*.ts'}` pattern.

## Tests (61 total)

### interaction/ (46 tests across 3 files)

**dragMachine.test.ts** (34 tests):
- tap (no drag): start-end returns to idle
- long-press then move: pending -> dragging -> commit
- long-press cancelled by scroll: large move cancels, small move stays pending
- move drag commit: full sequence with hit assertions
- resize-start edge: drags top edge
- resize-end edge: drags bottom edge
- create-by-drag: draws a range
- allow hook rejecting mid-drag: rejected commit becomes cancel; hook flips
  from deny to allow
- cancel from various phases: pending, dragging, idle
- pointer cancel during dragging and pending
- reset returns idle
- computePreview: move, create, resize-end, resize-start
- outside grid stays idle
- confirmLongPress from non-pending is a no-op

**mutations.test.ts** (8 tests):
- computeMoveDelta: same-day, cross-day, zero, negative day
- computeResizeDelta: end longer, start earlier, start later
- computeCreateRange: normal, swapped

**autoScroll.test.ts** (8 tests):
- middle of viewport, near top/bottom, at edges, outside edge zone, zero
  viewport, linear scaling, custom parameters

### edit/ (15 tests across 2 files)

**decideEdit.test.ts** (13 tests):
- Template: not customized -> askScope for move/resize/delete
- Template: already customized -> apply with occurrence data for move/resize/delete
- Template: unresolvable -> reject
- Template: not editable -> reject
- Plan occurrence: recurring, not customized -> askScope
- Plan occurrence: recurring, already customized -> apply with occurrence data
- Plan occurrence: not recurring -> direct apply
- Non-occurrence planner -> direct apply
- Non-editable planner -> reject
- Category/travel/external -> reject

**rangeAllowed.test.ts** (6 tests):
- valid 1h, exactly 24h, over 24h, end before start, zero duration, 5-minute

## What C.4 must wire up

The drag state machine has no production consumer yet. C.4's web renderer must:

1. **Feed pointer events**: translate DOM PointerEvent / TouchEvent into
   `NormalizedPointerEvent {phase, x, y, time}`, adjusting y for scroll
   position. Touch events must handle the synthetic-mouse suppression
   (FullCalendar's approach: ignore mouse events that follow a touch within
   a small window).

2. **Provide grid metrics**: `GridMetrics {hourHeight, columnWidth,
   visibleRange, snapMinutes, scrollTop, scrollHeight, viewportHeight}`.

3. **Manage the timer**: `transition()` returns `startTimer` / `cancelTimer`
   instructions; the renderer calls `setTimeout` / `clearTimeout` and feeds
   `confirmLongPress` when the timer fires.

4. **Draw the preview**: while `state.phase === "dragging"`, call
   `computePreview()` and render the ghost tile at the returned geometry.
   Color the ghost based on `preview.allowed`.

5. **Apply the commit**: when `state.phase === "committed"`, read
   `state.startHit` / `state.endHit` / `state.kind` and call the matching
   mutation function (`computeMoveDelta` / `computeResizeDelta` /
   `computeCreateRange`), then route through `decideEdit` to decide scope.

6. **Auto-scroll**: during dragging, call `autoScrollSpeed(pointerY,
   viewportHeight)` each animation frame and apply the returned speed to the
   scroll container.

7. **pendingEdit**: when `decideEdit` returns `askScope`, the renderer stores
   a `PendingEdit` and renders the tile at the preview position until the
   scope modal resolves. On cancel, `pendingEdit.revert()` is called.

The renderer contract is:
```
Renderer -> Core: NormalizedPointerEvent + GridMetrics
Core -> Renderer: DragState + DragPreview + EditDecision
```
