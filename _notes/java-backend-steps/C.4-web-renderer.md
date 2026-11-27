# C.4 Web renderer

**Status:** code DONE 2026-11-26; **open:** the manual side-by-side parity pass and
the default flip (both the user's, after review) -- Phase C (fourth step) --
cross-cutting context in [0.0a.java-backend-plan.md](0.0a.java-backend-plan.md)

## What was built

The main calendar drawn by its own DOM renderer over the shared core, at
`/calendar?renderer=own`. FullCalendar stays the default: without the parameter
`page.tsx` renders the existing `Calendar.tsx`, whose behavior is unchanged.

### Files (web, under `app/(protected)/calendar/_components/`)

| File | Role |
|---|---|
| `own/OwnCalendar.tsx` | The renderer: data, layout, grid, tiles, drag preview, commit routing, modals |
| `own/OwnCalendar.css.ts` | Grid / gutter / header / now-line / preview / resize-handle styles (theme vars) |
| `own/useDragInteraction.ts` | Web input adapter for the C.3 drag machine |
| `own/ownCalendarGeometry.ts` | Pure helpers: view type + range, column mapping, now line, segment order, tile box, drag spans and intents, span segments, hour labels |
| `calendarRenderer.ts` | `rendererFromParam` (the query-param switch) |
| `TileContent.tsx` | Per-kind tile dispatch shared by BOTH renderers (was inline in Calendar.tsx) |
| `ScopeModals.tsx` | The two RecurrenceScopeModals shared by both renderers (was inline in Calendar.tsx) |
| `editRouting.ts` | `buildEditContext` + `completedLeafRow`, shared (was in Calendar.tsx) |

Plus `utils/calendar-rendering/tileEvent.ts` + `fromEventImpl.ts` (the adapter seam
below) and one core addition (below).

### Renderer-to-core wiring

```
CalendarProvider arrays ─► buildCalendarEvents(range)            (model)
   ─► held PendingEdit override (tile at its drop position)
   ─► foreground: layoutEvents(range, hourHeight, compareSegments, 15px)   (layout)
      background (category): spanSegments, full column width
   ─► TileGeometry ─► tileBox(): top/height px, left/right %, zIndex

DOM pointer events ─► useDragInteraction
   ─► NormalizedPointerEvent {phase, x, y, time} + GridMetrics
   ─► transition / confirmLongPress / cancel / reset        (interaction)
   ─► dragging: dragIntent(state) ─► mirror tiles / create highlight
   ─► committed: commitIntent ─► create | move | resize
        move/resize ─► decideEdit(event, kind, buildEditContext(...))     (edit)
           apply   ─► the same apply functions Calendar.tsx calls
           askScope ─► hold(PendingEdit) + ScopeModals
           reject  ─► nothing
        create ─► NewPlanModal ─► createPlanFromSelection
```

- **View type** mirrors Calendar.tsx: `useIsMobile()` picks the 3-day window
  (starting on the anchor day; the page re-anchors to today on mobile), else the
  week snapped to `weekStartDay` via `computeVisibleRange`.
- **Geometry** matches the FullCalendar surface: 2.4rem 30-minute slots
  (2.8rem mobile) = 76.8 / 89.6 px per hour, 5-minute snap, 15px minimum tile
  height, scrolled to 05:00 on every range change (FullCalendar's
  `scrollTime` + `scrollTimeReset`). No DOM measurement for tiles; hit-testing
  reads the columns element's rect once per pointer event.
- **Overlap drawing** reproduces FullCalendar's default `slotEventOverlap`:
  width doubled (capped at the column edge), `zIndex = stackDepth + 1`, events
  layer inset 2px left / 2.5% right. FullCalendar's extra 20px right margin for
  `stackForward == 0` never fires (its `stackForward` is always >= 1), so it is
  not reproduced.
- **Drag mirror**: like FullCalendar, the dragged event's own tiles hide and a
  full-width mirror (the same TileContent at the new times) follows the pointer;
  the create selection is a background highlight, kept while NewPlanModal is
  open.
- **Commit routing** is a line-for-line mirror of Calendar.tsx's
  `onEventDrop` / `onEventResize` / `onSelect`, calling the shared
  `applyEventStartEdit` / `applyEventResize` (what `handleEventDrop` /
  `handleEventResize` unwrap to), `applyCompletedWindowEdit`,
  `applyOccurrenceMove`, `applyTemplateOccurrence{Move,Resize}`. Resolving a
  scope prompt either way releases the held tile.

### Input model (useDragInteraction)

- **Mouse**: a press is not fed to the machine until it travels 5px; then
  start + `confirmLongPress` + move are fed together. A click or double-click
  never starts a drag, so tile popovers (double-click) are untouched.
- **Touch / pen**: start goes to the machine at once; its `startTimer` becomes a
  `setTimeout(CALENDAR_LONG_PRESS_DELAY_MS)` feeding `confirmLongPress`. Moving
  past 5px first cancels (the machine's scroll detection); the browser's own pan
  arrives as `pointercancel`, same result. Columns are `touch-action: pan-y`; a
  non-passive `touchmove` listener blocks the pan only while dragging.
- **Touch selection** (FullCalendar's model): a long-press released in place
  selects the tile; the selected tile shows round resize handles that drag
  immediately; a touch on empty grid deselects. EventWrapper's
  "don't open the sheet on the selected tile" check now matches
  `[data-tile-selected]` as well as `.fc-event-selected`.
- **Auto-scroll**: a rAF loop during dragging applies `autoScrollSpeed` to the
  scroller and re-hit-tests at the still pointer.
- **Escape** cancels; the synthetic click after a drag is swallowed;
  long-press does not raise the context menu.
- Presses are ignored unless their DOM target is inside the grid: React bubbles
  pointer events from portaled popovers and modals through the tile tree.
- No allow hook: the main FullCalendar surface has no `eventAllow`.

## The shared-component adapter seam

The tile and popover components (EventContent, EventPopover, EventWrapper,
TemplateEventContent/Popover, TravelEventContent/Popover,
ExternalEventContent/Popover, `useTitleEditor`, and the event handlers they call)
read only six things off FullCalendar's `EventImpl`: `id`, `title`, `start`,
`end`, `backgroundColor`, `borderColor`, `extendedProps`. They now take
**`TileEvent`** (`utils/calendar-rendering/tileEvent.ts`), an interface of exactly
that surface (readonly, so assert-narrowing through aliases keeps working as it
did on EventImpl's getters).

- **Own path**: `tileEventFromCalendarEvent(event)` builds it from
  `tileColors(event)` + `tileExtendedProps(event)`.
- **FullCalendar path**: `toFullCalendarInput` now builds its EventInput from
  the SAME `tileColors` + `tileExtendedProps` (only display modes and resize
  locks stay FullCalendar-specific), and `renderEventContent` passes
  `tileEventFromEventImpl(event)` (`fromEventImpl.ts`, the shim) into the shared
  `TileContent`.
- **Parity test** (`__tests__/calendar/tileEventParity.test.ts`): fixtures for
  every kind (incl. null-props planner, overnight template, trespassing
  category, insufficient + overconstrained travel, external) go through a real
  FullCalendar `Calendar` instance (CalendarEvent -> EventInput -> FullCalendar's
  own EventImpl -> shim) and through `tileEventFromCalendarEvent`; the two
  TileEvents must be identical. The test resolves FullCalendar's preact through
  the `require` export condition (docblock) because jsdom's browser condition is
  ESM-only.
- `TemplateEventContent`'s CategoryWrapperEvent / template-popover callbacks moved
  with the dispatch into `TileContent`; Calendar.tsx's `renderEventContent` is now
  `useCallback([getEditContext])` and therefore MORE identity-stable than before.

C.6 deletes `fromEventImpl.ts`, `toFullCalendarInput.ts` and the `.fc-*` class
check in EventWrapper; `TileEvent` stays as the components' prop type (or is
replaced by `CalendarEvent` + `tileExtendedProps` at that point).

## Core gap filled

`TileGeometry` gained `stackDepth` and `stackForward`. The ported placement
already computed both on `SegRect`; `segRectToTile` dropped them. FullCalendar's
overlap rendering (`computeSegHStyle`) needs them for z-order and the doubled
width. Covered by `__tests__/calendar-core/layout/segmentGeometry.test.ts` (the
first direct `layoutEvents` tests). Nothing else in calendar-core changed.

## Tests

- web `__tests__/calendar/ownCalendarGeometry.test.ts` (25): renderer param,
  view type + hour heights, week/3-day ranges, column mapping, now line,
  segment order (whole-event duration), tile box (doubling, cap, z, min
  height), slice edges (overnight, midnight end), move/resize/create spans,
  drag/commit intents, span segments (overnight split), hour labels, DOM drag
  target resolution.
- web `__tests__/calendar/OwnCalendar.test.tsx` (6, RTL): mounts with fixture
  provider data; header + gutter; one tile per kind through the content
  components; tile top/height from hourHeight; a mouse move-drag through the
  real adapter + machine commits via `applyEventStartEdit` (inline engine mode)
  and shows the mirror at the new start; a click writes nothing; a create-drag
  opens NewPlanModal on the swept range. Content components and
  `.css` modules are stubbed (Vanilla Extract only compiles in the Next build).
- web `__tests__/calendar/tileEventParity.test.ts` (9): the seam, above.
- shared `__tests__/calendar-core/layout/segmentGeometry.test.ts` (3).

## What the manual parity pass must check

Side by side, `/calendar` vs `/calendar?renderer=own`, on the seeded account,
desktop AND mobile-web:

1. **Layout**: slot heights, hour labels (position, every hour), today tint in
   header and column, now line, scroll opens at 05:00 and resets on prev/next.
2. **Overlap**: dense clusters stack and overlap the same way (doubled widths,
   later tiles on top); tile order inside clusters.
3. **Templates incl. overnight sleep**: both halves render, dashed border; the
   week-boundary occurrence (Sunday night into Monday) shows on both sides.
4. **Category windows + trespass**: stripes and tint behind tiles, red trespass
   borders; the header hover chip over a window (FullCalendar's background
   events are `pointer-events: none`, and so are the own renderer's; check the
   chip behaves the same on both).
5. **Travel** (normal / insufficient / overconstrained) and **external**
   (busy / visual) tiles and their popovers.
6. **Edits**: drag a task, a plan, a recurring-plan occurrence (scope prompt;
   cancel snaps back, both answers apply), a template occurrence (move + resize,
   both scopes, cancel), a completed task (re-times completion), resize from the
   top and bottom edges, drag across days, drag near the top/bottom edge
   (auto-scroll speed feels the same), Escape mid-drag.
7. **Create**: drag on empty grid opens NewPlanModal with the same range.
   Also click once on empty grid: the own renderer creates nothing on a
   zero-length press; FullCalendar may select one snap slot there -- decide
   which is wanted. Snap rounding: the core's hit-test rounds to the nearest
   5 minutes where FullCalendar floors to the slot, so a created range can
   differ by one snap step.
8. **Popovers**: double-click (desktop) and tap (mobile) open the same
   popovers; no popover opens after a drag; hover actions on tiles.
9. **Mobile-web 3-day touch**: vertical scroll is free; long-press drags; a
   long-press released in place selects with dot handles and those resize; tap
   on empty grid deselects; long-press on empty grid starts a create; no
   context menu / text callout; the page does not pan while dragging
   (the non-passive touchmove block -- the riskiest browser-dependent piece).
10. **Mirror look**: the own mirror is the full tile at 85% opacity; the create
    highlight uses `accent.primary` at 18% (FullCalendar used its stock
    highlight color).

## What C.5 needs

- `useDragInteraction` and `ownCalendarGeometry` are renderer-generic over a
  range + hourHeight; WeekStructure needs a reference-week range (no dates),
  15-minute snap (`SNAP_MINUTES` becomes a parameter), and an allow hook
  (`DragMachineConfig.allowHook` is already plumbed through `config()`; pass it
  in and color the mirror with `DraggingState.allowed`).
- Its tiles are not TileContent; reuse the grid shell (header / gutter /
  columns / now line) by extracting it from OwnCalendar when C.5 needs a second
  consumer, not before.
- The template overlap tint is a live `allowed` read, which the mirror already
  has a slot for.
