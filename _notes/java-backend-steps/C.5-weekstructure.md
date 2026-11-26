# C.5 WeekStructure on the own renderer

**Status:** code DONE 2026-11-26; manual pass batched into the user's smoke run --
Phase C (fifth step) -- cross-cutting context in [0.0a.java-backend-plan.md](0.0a.java-backend-plan.md)

## What moved

The WeekStructureModal's grid (the reference-week editor for templates and
category windows) no longer uses FullCalendar. It is `WeekGrid`, drawn by the
own renderer machinery over the shared calendar core. Only the grid changed:
the banner, mode toggle, editor rails (TemplateEditor, WindowEditor with its
exception editor), mobile day navigation, discard confirm and the save path
(`useWeekStructureState`) are as they were.

### Files (web)

| File | Role |
|---|---|
| `components/calendar/timeGrid/TimeGridShell.tsx` | NEW: the shell both own grids share (scroller, sticky header, hour gutter, slot lines, columns); column content is the caller's |
| `components/calendar/timeGrid/timeGrid.css.ts` | Was `own/OwnCalendar.css.ts` (git mv); the mobile bottom-menu clearance stayed in `own/OwnCalendar.css.ts` as `bodyClearance` |
| `components/calendar/timeGrid/useDragInteraction.ts` | Was `own/useDragInteraction.ts` (git mv); `snapMinutes` and `allowHook` are now options |
| `components/calendar/timeGrid/timeGridGeometry.ts` | The renderer-generic half of `own/ownCalendarGeometry.ts`: spans, intents, tile box, segments, hour labels; snap is a parameter |
| `own/ownCalendarGeometry.ts` | Keeps the main-calendar half: view type, range, hour heights, 5-min snap, now line |
| `WeekStructureModal/WeekGrid/WeekGrid.tsx` | NEW: the reference-week grid (tiles, mirror, create highlight, tint) |
| `WeekStructureModal/WeekGrid/weekGridModel.ts` | NEW, pure: reference-week mapping, ring, create span, intent, allow hook |
| `WeekStructureModal/WeekGrid/WeekGrid.css.ts` | NEW: day labels, inactive harness, refused tint, touch-handle hit area |
| `WeekStructureModal/eventSerializers.ts` | `templateToEvent` / `windowToEvent` return core `CalendarEvent`s (`WeekGridEvent`) instead of FullCalendar `EventInput` |
| `WeekStructureModal/WeekStructureModal.tsx` | FullCalendar + its handlers out; `handleCreate(span)` / `handleEdit(block, span)` in |
| `WeekStructureModal/WeekStructureModal.css.ts` | The `.week-structure-fc` global stylesheet deleted |

OwnCalendar renders through `TimeGridShell` with unchanged behavior (its RTL
suite passes untouched apart from the css mock path).

## The reference-week model

- **Seven abstract weekdays on fixed dates.** The core works in Dates, so the
  grid draws the week holding `REFERENCE_WEEK_DATE` (2024-01-01) snapped back
  to `weekStartDay` (`referenceWeekStart`). Only weekday + time-of-day of any
  date carry meaning. A January week keeps DST out of the grid.
- **Columns.** Column `i` is weekday `(weekStartDay + i) % 7`
  (`weekdayForColumn` / `columnForWeekday`); headers are `EEE` of the column
  date. Mobile shows one column (`weekGridRange(weekStartDay, dayIndex)`), the
  modal's existing day navigation picks it.
- **The ring.** The week wraps: a block running past the last column (a
  Sunday-night window in a Monday-first week, a Saturday-night one in a
  Sunday-first week) continues in the first column. Each block is laid out
  three times (`ringCopies`: -7, 0, +7 days, same id); the core's day slicing
  clips each copy to the visible range, so the tail lands in column 0 and the
  previous day's overnight tail shows on a single mobile day. Mirrors and the
  create highlight use the same ring (`ringSegments`). This is new: the
  FullCalendar grid cut a block off at the week's last column.
- **Commit.** A drag's span may sit a week to either side of the reference
  week (after crossing the ring's edge); the modal keeps only
  `dateToWeekDay(start)` + times, which are the same on every copy.
  `windowRangeOverlaps` already compares on the weekly ring.
- **Blocks as core events.** A template is a `TemplateCalendarEvent`, a window
  a `CategoryCalendarEvent` (the kinds the main calendar draws them as), plus
  `gridKind`, `sourceId`, `color`, `active`, `assigned`, `focused`. Ids are
  `tpl:<id>` / `win:<id>`; `occurrenceKey` is empty (there are no occurrences
  in a reference week). `editable` is the mode match.

## Snap and tint wiring

```
templates + windows ─► WeekGridEvent[] (eventSerializers)
   ─► ringCopies ─► layoutEvents(range, hourHeight, compareSegments, 15px)
   ─► tileBox ─► WeekTile (EventTile inside)

pointer ─► useDragInteraction {snapMinutes: 15, allowHook}
   ─► core transition / confirmLongPress (hitTest snapped to 15)
   ─► allowHook(preview, event, kind, {startHit, currentHit})
        = weekGridAllowHook(mode, windows):
            weekGridIntent(hits) ─► span
            weekGridSpanAllowed: rangeAllowed (end > start, <= 24h)
              window (edit, or create in windows mode):
                !windowRangeOverlaps(windows, span, self)
              template: allowed (overlap by design, the engine warns)
   ─► DraggingState.allowed ─► mirror / create highlight data-invalid (red)
   ─► release: allowed ─► commit ─► onCreate / onEdit ─► modal handlers
               refused ─► cancelled (the block snaps back)
```

- **Snap.** 15 minutes, passed through `GridMetrics.snapMinutes` (the core's
  hit-test) and to `resizeSpan`'s floor (`WEEK_GRID_SNAP_MINUTES`). The main
  calendar still passes 5.
- **Tint = outcome.** The hook computes the exact span the commit computes
  (`weekGridIntent`, the same function `onCommit` calls), so the red preview
  and a refused release can never disagree. The modal re-checks
  `rangeAllowed` / overlap in its handlers (the old "never trust the live
  rejection alone" rule), which is now redundant but cheap.
- **Create joins hits across columns** (`createSpanFromHits`, FullCalendar's
  time-grid selection): an overnight block can be drawn from one evening into
  the next morning, as before. C.4's `createSpan` is single-column (end hit's
  day) -- a main-calendar parity gap noted for its pass, not changed here.
- **Template exceptions.** A move or start-edge resize that changes the
  weekday or start time clears `recurrenceExceptions` (the existing re-anchor
  rule); an end-edge resize keeps them. The weekday compare now normalizes
  `startDay` through `startDayAsInt`, so a string-typed `startDay` no longer
  reads as a change. A start-edge resize into the previous column now updates
  the weekday too (the FullCalendar handler ignored the day on resizes).

## Core additions (both platform-free, both small)

1. **`AllowHook` gets the hits**: a fourth argument
   `{startHit, currentHit}` (new type `AllowHits`). The day-local
   `DragPreview` cannot express an overnight span or a move into another
   column, which the window-overlap check needs. Existing hooks are
   unaffected. Test: `dragMachine.test.ts` "hands the hook the start and
   current hits, across columns".
2. **`hitTest` reaches 24:00**: the snapped minute is clamped to 1440 instead
   of going through `snapMinutes` (which caps at `1440 - snap`), so a drag can
   end a range at midnight (the "23:59" sentinel for windows). This also lets
   the main own calendar resize/create to midnight, which FullCalendar
   allowed. `snapMinutes` itself is unchanged. Test: `hitTest.test.ts`
   "reaches 24:00 at the column's bottom edge".

## Touch (mobile web, iOS Safari)

The FullCalendar grid had touch support (`longPressDelay`, the enlarged
resize dots, callout suppression), so parity is kept rather than going
pointer-only:

- Long-press (`CALENDAR_LONG_PRESS_DELAY_MS`) starts a drag; moving first is a
  scroll (the machine's threshold, or the browser's `pointercancel`).
- A long-press released in place selects the block in the rail and shows the
  resize dots; the dots drag at once; a touch on empty grid hides them.
- Columns are `touch-action: pan-y`, so vertical scroll stays native while
  idle; a non-passive `touchmove` listener blocks the pan only while dragging;
  the resize dots are `touch-action: none` (a touch starting on a dot never
  becomes a scroll).
- `-webkit-touch-callout: none` + `user-select: none` on the columns (tiles
  inherit); the context menu is suppressed while a touch gesture is live.
- Dot hit area: a 40px target (`::before` inset -12px), the modal's old
  FullCalendar tuning, scoped to the WeekGrid root.

All of that is the shared shell + adapter from C.4; WeekGrid adds only the hit
area. Inactive blocks (the other mode's) have `pointer-events: none`, so a
window can be drawn over templates and vice versa, as before.

## Tests

- web `__tests__/calendar/weekGridModel.test.ts` (16): reference-week start
  and weekday <-> column for weekStartDay 0/1/3/6, template on its column,
  mobile single-day range; the ring (Sunday-night wrap into column 0, the
  previous day's tail on a mobile day); 15-min resize floor, cross-column
  overnight create, create to 24:00; the allow hook: window-onto-window deny
  (and its clear), self-exclusion, overnight morning half, the Sat/Sun seam in
  Monday- and Sunday-first weeks, Sunday night wrapping into Monday, templates
  allowed over templates and windows, the 24h cap.
- web `__tests__/calendar/WeekGrid.test.tsx` (9, RTL through the real adapter
  + machine): weekday headers, ring rendering, mouse move snapped to 15 (a
  5-minute snap would differ), live red mirror + reverted drop for a window
  onto a window, template onto template commits, overnight create across
  columns + refused create with a red highlight, inactive blocks marked
  `data-inactive`, touch long-press select -> dots -> handle resize on the
  15-min grid -> long-press move, touch movement before the long-press is a
  scroll.
- `weekStructureOvernight.test.ts` unchanged in substance (two `as Date`
  casts dropped: `windowToEvent` now returns Dates).
- shared: the two core tests above.

## Manual checklist (batched smoke pass)

Desktop and mobile web, opened from /calendar (templates), /categories
(windows, focused category) and onboarding:

1. Grid look: weekday headers in `weekStartDay` order (change the setting and
   reopen), hour labels, opens scrolled to 06:00, other-mode blocks dimmed,
   focused-category windows bright and the rest muted.
2. Templates: draw one, move it within and across days, resize both edges to
   15-minute steps, resize the end to the bottom edge (midnight) and past it
   into the next column (overnight); drop one onto another (allowed).
3. Windows: draw one; drag one onto another -> the preview turns red and the
   release snaps it back; same for a resize into a neighbor and a draw over an
   existing window (red highlight, nothing created).
4. Overnight windows: a Monday 23:00-07:00 window shows both halves; with a
   Monday-first week, a Sunday 23:00-07:00 window shows its tail at the top of
   Monday (new: FullCalendar cut it off); dragging a window into that tail is
   refused; same at the Sat/Sun seam with a Sunday-first week.
5. Draw a window from one evening across into the next morning.
6. Rail: clicking a block opens its editor, red outline on the selected
   block; edits in the rail (times, category, duplicate, delete) re-render the
   grid; template exceptions survive an end-edge resize and clear on a move.
7. Save writes and the main calendar/engine reflect it; Cancel with changes
   asks to discard.
8. Escape mid-drag cancels; a click without travel only selects.
9. **WeekStructure grid on iOS Safari: long-press drag, resize via handles,
   scroll stays free when idle, no OS callout.** Also: a long-press released
   in place shows the dots, a tap on empty grid hides them, the modal/page
   does not pan while dragging, no context menu or text-selection loupe, day
   navigation arrows still switch the single day.
10. Android Chrome: same as 9.

## For C.6: FullCalendar surface left

The WeekStructure surface is FullCalendar-free. What still imports it:

- `app/(protected)/calendar/_components/Calendar.tsx` (the default main
  calendar until C.4's default flip) and `_styles/fullcalendar.css.ts`.
- `utils/calendar-rendering/toFullCalendarInput.ts`, `fromEventImpl.ts`.
- `utils/calendarEventHandlers.ts` (`EventDropArg`, `EventResizeStartArg`
  types).
- `utils/template-handlers/templateEventHandlers.ts` (`FullCalendar`,
  `DateSelectArg` types; used by ScopeModals / TileContent) and
  `utils/templateBuilderUtils.ts` (`EventInput`, only imported by it).
- `components/events/EventWrapper` -- the `.fc-event-selected` half of its
  selected-tile check.
- Tests: `tileEventParity.test.ts` (a real FullCalendar instance, by design),
  `completed-task-not-rescheduled.test.ts` (`EventImpl` type).
- The identity-stable-options rule in `client/web/CLAUDE.md` now applies only
  to Calendar.tsx (the modal's copy of the comment went with its grid).
