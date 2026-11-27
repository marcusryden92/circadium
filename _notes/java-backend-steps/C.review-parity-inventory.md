# C review: behavioral parity inventory

**Status:** review pass over C.1-C.5, 2026-11-26. Working checklist for the
user's confirmation walk before the C.4 default flip. Cross-cutting context in
[0.0a.java-backend-plan.md](0.0a.java-backend-plan.md); decisions per step in
C.1-C.5.

Classification: **PORTED** (code that reproduces it), **TESTED** (a test pins
it), **DROPPED** (consciously, justified below), **GAP** (a finding: not
reproduced and not justifiably dropped). "own" = `/calendar?renderer=own`.
Paths are relative to `client/`.

Fixes made by this review (commits on feature/calendar-core):

| Commit | What |
|---|---|
| 5452a4fd | Wall-clock grid math across DST (`calendar-core/layout/wallClock.ts`); main-calendar create joins hits across columns |
| 2b498e9e | 40px touch target on the resize dots for the main own calendar (was WeekGrid-only) |
| 2b94f8fc | A mouse press released outside the grid no longer arms a phantom drag |
| 68531fab | Own category windows stay hit-testable, so the header category chip works |
| 83b20ce8 | page.tsx: literal NUL in a template literal replaced by `\u0000` (git saw the file as binary) |

## 1. Calendar.tsx props (the still-default FullCalendar path)

| # | Prop / option | Own equivalent | Class | Evidence |
|---|---|---|---|---|
| 1 | `plugins` daygrid/timegrid/interaction | n/a, own renderer | PORTED | `own/OwnCalendar.tsx` |
| 2 | `initialDate` + `gotoDate` on change | range derived from `initialDate` each render | PORTED / TESTED | `ownCalendarGeometry.viewRange`; `ownCalendarGeometry.test.ts` "view type" |
| 3 | `timeZone="local"` | local Dates; all grid<->instant math now in `layout/wallClock.ts` (seam for a future display zone) | PORTED / TESTED | `wallClock.dst.test.ts`, `timeGridDst.test.ts` |
| 4 | `events` (five streams via `toFullCalendarInput`) | `buildCalendarEvents` -> `tileEventFromCalendarEvent` | PORTED / TESTED | `tileEventParity.test.ts` (real FullCalendar instance vs own adapter) |
| 5 | `datesSet` -> visible range for template expansion | range computed directly | PORTED | `OwnCalendar.tsx` `range` memo |
| 6 | `initialView="timeGridWeek"`, `views.timeGridThreeDay` (mobile 3-day via `useIsMobile`) | `selectViewType` / `viewDayCount` / `viewRange` (3-day starts on anchor) | PORTED / TESTED | `ownCalendarGeometry.test.ts` |
| 7 | `scrollTime="05:00:00"` (+ default `scrollTimeReset`) | scroll to 05:00 on every range/hourHeight change | PORTED | `OwnCalendar.tsx` layout effect |
| 8 | `allDaySlot={false}` | no all-day row; all-day externals filtered in the model | PORTED / TESTED | `externalEventsToCalendarEvents.test.ts` |
| 9 | `snapDuration="00:05:00"` | `SNAP_MINUTES = 5` into the core hit-test | PORTED / TESTED | `OwnCalendar.test.tsx` drag |
| 10 | `slotDuration` default 30 min, `.fc-timegrid-slot` 2.4rem / 2.8rem mobile | `HOUR_HEIGHT_DESKTOP/MOBILE`, 48 slot lines, dotted minor | PORTED / TESTED | `ownCalendarGeometry.test.ts` "hour height" |
| 11 | `longPressDelay={CALENDAR_LONG_PRESS_DELAY_MS}` (events + select) | adapter timer -> `confirmLongPress` | PORTED / TESTED | `WeekGrid.test.tsx` touch cases |
| 12 | `firstDay={weekStartDay}` | `computeVisibleRange(firstDay)` | PORTED / TESTED | `visibleRange.test.ts` |
| 13 | `nowIndicator` | `nowLinePosition`, 60s tick, arrow hidden as before | PORTED / TESTED | `ownCalendarGeometry.test.ts` "now line" |
| 14 | `height="100%"` | flex root | PORTED | `timeGrid.css.ts root` |
| 15 | `slotLabelFormat` 24h HH:mm | `hourLabels()` | PORTED / TESTED | "hour labels" test |
| 16 | `eventTimeFormat` | tile components format their own times (not FullCalendar's timeText) | N/A | `EventWrapper` |
| 17 | `eventOrder="-duration,start"` | `compareSegments`: whole-event duration desc, start asc, stable on stream order. FullCalendar's `buildSegCompareObj` also uses the whole instance range and a stable sort (core/internal-common.js L4411-4425) | PORTED / TESTED | "segment order" test |
| 18 | `dayHeaderContent={renderDayHeader}` | same function, `{date, isToday}` | PORTED | `OwnCalendar.tsx` columns |
| 19 | `editable` (per-event `editable` from the model) | `resolveDragTarget` refuses non-editable | PORTED / TESTED | "drag target resolution" test |
| 20 | `eventResizableFromStart` | start + end handles, `sliceEdges` places them on the real edges | PORTED / TESTED | "slice edges" test |
| 21 | external `durationEditable: false` | externals are `editable: false` anyway | N/A | model builders |
| 22 | category `display: "background"` | background layer, full column width, outside placement | PORTED | `OwnCalendar.tsx` backgroundByDay |
| 23 | `selectable` + `select` -> NewPlanModal | create drag -> `setPendingPlan` -> NewPlanModal; highlight held while open | PORTED / TESTED | `OwnCalendar.test.tsx` create |
| 24 | selection across columns (`joinHitsIntoSelection`) | `createSpan` joins hits | PORTED (fixed here) / TESTED | `timeGridDst.test.ts` "create joins hits" |
| 25 | click on empty slot selects one snap (FullCalendar `selectMinDistance` 0, interaction/index.js L1120-1185) -> NewPlanModal with a 5-min range | zero-length press creates nothing | **OPEN QUESTION Q1** | `createSpan` returns null |
| 26 | selection end = end of the hovered snap slot (hits floor to slot, range runs to slot end) | hits round to the nearest 5 min, end = the rounded hit | **OPEN QUESTION Q2** | `layout/hitTest.ts` L119-123 |
| 27 | `eventDrop` (decideEdit branches, plan/template scope, completed re-time, start edit) | `commitMove`, same branches and apply functions | PORTED / TESTED | `OwnCalendar.test.tsx` move commit; `decideEdit.test.ts` |
| 28 | `eventResize` | `commitResize` | PORTED | mirror of Calendar.tsx |
| 29 | `revert()` on scope cancel | held `PendingEdit` released on cancel or apply | PORTED | `OwnCalendar.tsx` hold/release |
| 30 | `eventContent` -> `TileContent` | same component, `TileEvent` | PORTED / TESTED | `tileEventParity.test.ts` |
| 31 | `headerToolbar={false}` | page header unchanged | N/A | |
| 32 | `unselect()` on NewPlanModal close | `setPendingPlan(null)` clears the highlight | PORTED | |
| 33 | FullCalendar default `eventMinHeight` 15 | `EVENT_MIN_HEIGHT` | PORTED / TESTED | "tile box" test |
| 34 | default `slotEventOverlap` (doubled width, z by depth, 2px / 2.5% insets) | `tileBox`, `eventsLayer` | PORTED / TESTED | "tile box" test, placement parity fixtures |
| 35 | overlap placement (SegHierarchy + web) | MIT port | PORTED / TESTED | `placement.parity.test.ts` (9 fixtures) |
| 36 | default `eventDragMinDistance` 5 (mouse) | `MOUSE_DRAG_DISTANCE` | PORTED / TESTED | "a click without travel writes nothing" |
| 37 | default `dragScroll` (AutoScroller: 50px edge, quadratic, 300 px/s, only toward an edge the pointer moved to) | linear, 25 px/frame (~1500 px/s at 60 Hz), no moved-toward guard | **GAP G2** | `interaction/autoScroll.ts` L13-43; interaction/index.js L517-620 |
| 38 | default `dragRevertDuration` (500 ms animated snap-back) | instant snap-back | DROPPED (cosmetic) | main calendar has no eventAllow; reverts only on scope cancel |
| 39 | drop released outside the calendar reverts (no hit) | commits at the last in-grid hit | DROPPED, confirm in walk (Q4) | `dragMachine.ts` L210 |
| 40 | Escape cancels a drag | window keydown -> `cancel` | PORTED | `useDragInteraction.ts` |
| 41 | touch: long-press drag, scroll cancels pending | timer + 5px threshold + `pointercancel` | PORTED / TESTED | `WeekGrid.test.tsx` "touch movement before the long-press is a scroll" |
| 42 | touch: event selected on drag start (any long-press drag, not only release-in-place) (interaction/index.js L1270-1276) | selected only when released in place | **GAP G3** | `OwnCalendar.tsx` onCommit |
| 43 | touch: a selected event drags immediately, no second long-press (L1249-1252) | needs a new long-press | **GAP G3** | `useDragInteraction.ts` L326-330 |
| 44 | touch: deselect on any pointerup not started on an event, page-wide, not after a touch scroll (UnselectAuto, L1732-1770) | deselect only on a touch on empty grid, including at the start of a scroll | **GAP G3 (minor)** | `useDragInteraction.ts` L308-310 |
| 45 | FullCalendar's touch slop before the long-press fires (pan threshold of the browser) | 5px cancels | GAP G7 (tunable) | `TOUCH_MOVE_THRESHOLD` |

## 2. `.fc-*` overrides

`app/(protected)/calendar/_styles/fullcalendar.css.ts` (scoped `.circadium-calendar`):

| Override | Encoded behavior | Own equivalent | Class |
|---|---|---|---|
| `.fc-timegrid-body` mobile margin-bottom | last hours clear the floating bottom menu | `own/OwnCalendar.css.ts bodyClearance` | PORTED |
| `.fc` font, flex | layout | `timeGrid.css.ts root` | PORTED |
| `.fc-scrollgrid`, `.fc-theme-standard` borders -> `vars.rule` | grid lines on theme token | `slotLine`, `column`, `headerCell` borders | PORTED |
| right-edge border removal | no double rule against the engine column | columns draw `borderLeft` only | PORTED |
| `.fc-media-screen` no border/radius | | n/a | PORTED (nothing to undo) |
| `.fc-col-header` 3% ink tint | header tint | `headerRow` (mixed with paper: sticky needs opaque) | PORTED |
| `.fc-col-header-cell-cushion` flex center | | `headerCell` | PORTED |
| `.fc-timegrid-axis-cushion` / `slot-label-cushion` 10.5/600 muted tabular | gutter labels | `hourLabel` | PORTED |
| `.fc-timegrid-slot` 2.4rem / 2.8rem | slot height | hour heights | PORTED / TESTED |
| `.fc-timegrid-col` transparent | | columns transparent | PORTED |
| `.fc-day-today` accent.now 4% | today tint | `[data-today]` header + column | PORTED |
| `.fc-event` no border/radius/shadow, 11.5/600, pointer, theme transition | tile chrome | `tile` | PORTED |
| `.fc-event-main`, `.fc-v-event` resets | | n/a | PORTED |
| `.fc-bg-event` opacity 1, pointer-events none | windows opaque, box not hit | `backgroundTile` (content hit-testable, see app/calendar.css below) | PORTED (fixed here) |
| now-indicator line 2px accent.now, arrow hidden | | `nowLine` | PORTED |
| `.fc-scroller` hidden scrollbars | | `scroller` | PORTED |
| table widths 100% | | n/a | PORTED |
| `.fc-timegrid-daygrid-day-top` hidden | | n/a (no all-day row) | PORTED |
| resizer dot vars 16px / 2.5px, selected overlay transparent | touch dots | `[data-tile-selected] > resizer` | PORTED |
| `.fc-event-resizer` `touch-action: none` | a touch on a dot never scrolls | same on the dots | PORTED |
| selected resizer colors | | same | PORTED |
| selected resizer `::before` -12px (40px target) | finger-sized handles | shared `timeGrid.css.ts` | PORTED (fixed here; was WeekGrid-only) |
| `.fc-event-selected` ring | selected tile ring | `[data-tile-selected]` | PORTED |
| `.fc-event` touch-callout / user-select none | no iOS callout | on `columns` (inherited) | PORTED |

`app/calendar.css` (global, imported by `app/globals.css`, ALL `.fc-*`; not
in C.5's C.6 list):

| Override | Effect still live under the scoped sheet | Own | Class |
|---|---|---|---|
| `.fc-event:hover { transform: scale(1.01) }` | tiles grow slightly on hover (the scoped sheet does not reset transform) | none | **GAP G6 (cosmetic, decide)** |
| `.fc-event` color white, overflow hidden | superseded by EventWrapper's own color / overflow | EventWrapper | N/A |
| `.fc-bg-event .fc-event-main { pointer-events: auto }` | window content hit-testable -> header category chip | `backgroundTile` now hit-testable | PORTED (fixed here) |
| toolbar / button / today-button / misc | toolbar disabled; rest overridden by the scoped sheet | n/a | N/A |

Other `.fc-` references: `EventWrapper.tsx` L162 (`.fc-event-selected` half of
the selected check, C.6), `ExternalEventContent.tsx` L54 / `.css.ts` L6
(comments about the global `.fc-event` transparent background; rot at C.6).

## 3. WeekStructureModal grid (pre-C.5 FullCalendar config, `git show b64ae300`)

| Behavior | Own | Class | Evidence |
|---|---|---|---|
| week view, mobile `timeGridDay` driven by day nav | `weekGridRange(weekStartDay, dayIndex)` | PORTED / TESTED | `weekGridModel.test.ts` |
| `firstDay`, `dayHeaderFormat` weekday short | `EEE` headers in weekStartDay order | PORTED / TESTED | `WeekGrid.test.tsx` headers |
| `snapDuration` 15, `slotDuration` 30, 2.2rem / 2.6rem slots | `WEEK_GRID_SNAP_MINUTES`, hour heights | PORTED / TESTED | "mouse move snapped to 15" |
| `scrollTime` 06:00 | layout effect | PORTED | |
| `longPressDelay`, touch dots, 40px hit area | shared adapter + shell | PORTED / TESTED | WeekGrid touch tests |
| `selectAllow`: rangeAllowed + no window overlap in windows mode | allow hook, red highlight, refused release | PORTED / TESTED | weekGridModel allow-hook tests |
| `selectMirror` (an event-like mirror with live time text while drawing) | plain highlight, no time text | **GAP G5 (minor)** | `WeekGrid.tsx` createSegments |
| `eventAllow` red host + post-hoc revert for windows | `DraggingState.allowed` -> red mirror; refused release cancels; modal re-checks | PORTED / TESTED | "live red mirror + reverted drop" |
| `eventOverlap` true for templates | templates allowed over anything | PORTED / TESTED | "template onto template commits" |
| `eventClick` selects the block (active only) | tile `onClick`, active only | PORTED | |
| inactive mode blocks pass presses through | `pointer-events: none` on `[data-inactive]` | PORTED / TESTED | |
| drop: day/time/duration, exception clear on re-anchor | `handleEdit` | PORTED | |
| resize ignored the day (FullCalendar handler) | start-edge resize into the previous column now updates the weekday | DIVERGENCE, declared C.5 (improvement) | |
| block cut off at the week's last column | ring: wraps into column 0 | DIVERGENCE, declared C.5 (improvement) / TESTED | "ring" tests |
| string-typed `startDay` read as a change | normalized via `startDayAsInt` | DIVERGENCE, declared C.5 (bug fix) | |
| identity-stable options rule | not needed | DROPPED (FullCalendar-only) | |

## 4. Declared divergences in the step files

| Step | Divergence | Verdict |
|---|---|---|
| C.1 | overlaps-the-range template expansion (overnight / cross-week moved occurrences) | accept (fixes vanishing tiles) |
| C.1 | past weeks show template series | accept; FullCalendar's RRule plugin did the same |
| C.2 | `snapMinutes` caps at 1440 - snap | superseded by C.5's 24:00 hit |
| C.4 | 20px `stackForward == 0` margin not reproduced (never fires) | accept |
| C.4 | mirror at 85% opacity, create highlight accent.primary 18% | cosmetic, confirm in walk |
| C.4 | zero-length press creates nothing | Q1 |
| C.4 | round-to-nearest snap | Q2 |
| C.4 | C.4 item 4 says FullCalendar background events are `pointer-events: none`: true of the box, but the global `app/calendar.css` re-enabled the content, which is what the chip needs | corrected by 68531fab |
| C.5 | `createSpan` single-column on the main calendar | fixed by 5452a4fd |
| C.5 | ring, start-edge weekday update, `startDay` normalization | accept |
| C review | plan start-edge resize (both renderers): `applyEventResize` wrote only `duration`, so the regen re-anchored the new length at the old `starts` (Wed 16-20 dragged to Tue 12 committed as Wed 16 -> Fri 00). Present in prod (`b64ae300`, same code since 0.6). Now writes `starts` too for non-recurring plans; occurrences still resize the series without moving its anchor; tasks/goals duration only | fixed |

## 5. Consciously dropped (never-vs-not-currently rule)

| Item | Why it may go |
|---|---|
| FullCalendar option/plugin system, identity-stable options | FullCalendar machinery; the own renderer has no option diffing |
| animated revert (`dragRevertDuration`) | cosmetic; the only revert paths are a scope-prompt cancel and a refused WeekGrid drop, both instant by design |
| daygrid / month / list views, all-day row | never used by the app (only timeGrid week/3-day/day); all-day externals are filtered in the model since v1 |
| FullCalendar `eventTimeFormat` timeText | the tile components never read it |

Deferred, seam preserved (roadmap-plausible):

| Item | Seam |
|---|---|
| display timezone (work travel) | `calendar-core/layout/wallClock.ts` (wall minutes, wall-day shifts, hit -> instant). Still reading local time directly: `layout/visibleRange.ts` + `layout/hitTest.ts` (date-fns `startOfDay`/`addDays`/`getDay`), `expandTemplateOccurrences.ts` (rule positions), `timeWindow.ts` (WeekStructure weekly ring), `web .../ownCalendarGeometry.ts viewRange`. A zone option replaces those plus wallClock |
| other day counts (e.g. 5-day, 1-day main view) | `viewDayCount` / `computeVisibleRange(dayCount)` |
| keyboard drag | the machine takes normalized events from any source |

## 6. Open questions for the user's walk

- **Q1** Click (desktop) or long-press-release (touch) on empty grid: FullCalendar opened NewPlanModal with a 5-minute range; the own renderer does nothing. Keep FullCalendar's (one line in `createSpan`/`onCommit`) or keep the own?
- **Q2** Create ranges: FullCalendar ran from the floored start slot to the END of the slot under the pointer; the own rounds both ends to the nearest 5 min, so a drawn range is often 5 min shorter. Match FullCalendar?
- **Q3** Auto-scroll feel (G2): own scrolls ~5x faster at the edge and starts scrolling immediately when a drag begins near an edge.
- **Q4** Releasing a drag outside the grid: FullCalendar reverted, the own commits at the last in-grid position.
- **Q5** Tile hover grow (`scale(1.01)` from the global stylesheet): carry over or let it go?
- **Q6** Touch selection model (G3): FullCalendar selected on every long-press drag, let the selected tile drag without a second long-press, and deselected on any tap elsewhere on the page.
- **Q7** Template durations across a DST night (G8): the own end is start + duration in elapsed minutes (an 8h sleep from 23:00 ends 08:00 on the spring night); FullCalendar's RRule plugin added the duration in wall-clock (07:00). Which does the engine use? The renderer should match it.

## 7. Manual walk (~30 min)

Open `/calendar` and `/calendar?renderer=own` side by side on the seeded account.

Desktop:

1. Layout: slot heights, hour labels, today tint (header + column), now line, opens at 05:00, prev/next resets scroll; change week start day in settings, reopen.
2. Overlap: a dense cluster stacks the same way (doubled widths, later on top, order).
3. Templates: overnight sleep shows both halves, dashed border; the Sunday-night occurrence shows on both sides of the week boundary.
4. Category windows: stripes and tint behind tiles, red trespass borders; hover a window -> the header chip names it (fixed here; was blank on own); hover a travel tile over a window -> "Travel" wins.
5. Travel (normal / insufficient / overconstrained) and external (busy / visual) tiles and popovers (double-click).
6. Edits: drag a task, a plan, a recurring-plan occurrence (scope prompt: cancel snaps back, both answers apply), a template occurrence (move + resize, both scopes, cancel), a completed task (re-times completion); resize top and bottom; drag across days; Escape mid-drag. Q4: release a drag outside the grid.
7. Q3: drag a tile toward the bottom edge; compare scroll speed; start a drag near the edge.
8. Create: drag on empty grid -> NewPlanModal range; drag from 22:00 into the next column's 02:00 (overnight, fixed here); Q1: single click on empty grid; Q2: compare the end time of a drawn range.
9. Q5: hover tiles.
10. Press a tile, flick the mouse off the grid, release outside, hover back: nothing drags (fixed here).
11. WeekStructure (from /calendar, /categories focused, onboarding): C.5 checklist items 1-8 (grid look, templates draw/move/resize incl. midnight and overnight, window overlap red + snap back, overnight windows incl. the Sunday-night tail and the Sat/Sun seam, evening-to-morning draw, rail edits + exception survival, save/cancel, Escape). G5: drawing shows no live time text (FullCalendar's selectMirror did).
12. DST: navigate to the week of 2027-03-28 (EU spring forward) and 2026-10-25 (fall back): tiles on the Sunday sit on their clock lines and the now line logic agrees; drag a tile from Friday onto that Sunday and check its time in the popover (fixed here). Q7: the overnight sleep template on that night.

Mobile Safari (iOS), then Android Chrome:

13. 3-day window anchored on today; vertical scroll free; no callout / loupe / context menu on long-press.
14. Long-press a tile and drag; the page does not pan while dragging (the non-passive touchmove block, the riskiest piece).
15. Long-press release in place -> dots; the dots are easy to grab (40px target, fixed here) and resize; tap empty grid hides them. Q6: after a long-press DRAG, are dots shown (FullCalendar: yes)? Drag the selected tile again: FullCalendar needed no second long-press. Tap the page header: FullCalendar deselected.
16. Long-press empty grid -> create drag; Q1 with a long-press released in place.
17. Tap a tile opens the bottom-sheet popover; not after a long-press select.
18. WeekStructure on iOS: C.5 checklist item 9 (long-press drag, dot resize, idle scroll, no callout, no pan while dragging, day arrows).
