# C.1 View model

**Status:** DONE 2026-11-26 -- Phase C (first step) -- cross-cutting context in
[0.0a.java-backend-plan.md](0.0a.java-backend-plan.md)

## What was done

1. **CalendarEvent discriminated union** in `client/shared/src/calendar-core/model/`
   (`calendarEvent.ts`): five kinds keyed by `EventType` -- planner, template, category,
   travel, external. Carries only the user's own data colors; theme fallbacks are the
   renderer's concern. Framework-free TS (no React, no FullCalendar, no theme imports).

2. **Five builders** in the same directory:
   - `simpleEventsToCalendarEvents` -- persisted plans + scheduled tasks.
   - `templatesToCalendarEvents` -- expands EventTemplate config via
     `expandTemplateOccurrences` over the visible range (see decision 1).
   - `categoryEventsToCalendarEvents` -- joins CategoryEvent rows with Category for color,
     name, strict mode.
   - `travelEventsToCalendarEvents` -- joins TravelEvent rows with locations.
   - `externalEventsToCalendarEvents` -- filters disabled/all-day, resolves busy-ness.

3. **`buildCalendarEvents`** -- the single entry point merging all five streams in a fixed
   order (persisted, templates, category, travel, external). Calendar.tsx calls it in a
   `useMemo` keyed on the visible range + all source arrays.

4. **`toFullCalendarInput`** mapper (`client/web/utils/calendar-rendering/`) -- the only
   FullCalendar-specific file: maps CalendarEvent to EventInput with display modes, resize
   locks, theme color fallbacks, and the extendedProps bag the tile and popover components
   read. Planner events spread their props verbatim (no injected eventType for null-props
   rows).

5. **`expandTemplateOccurrences`** reworked to overlaps-the-range semantics (see
   decision 1). Moved exceptions are emitted wherever their new span lands regardless of
   where the rule position falls.

6. **`isExternalEventBusy`** moved to `@circadium/shared/domain/external-calendar/`; web
   re-export shim in `deriveExternalBusyEvents.ts`. **`modeExceptions`** moved to shared;
   web re-export shim.

7. **Removed from web**: `@fullcalendar/rrule`, `@fullcalendar/luxon3`, `luxon`,
   `@types/luxon`. The `rrule` package, the webpack alias in `next.config.mjs`, and
   `getRRuleDayTypeFromIndex` in `calendarUtils.ts` intentionally stay (the scheduling
   engine uses rrule; step C.6 owns their removal).

8. **Calendar.tsx** now seeds the visible range from `startOfWeek(initialDate)` for the
   first paint, tracks it via FullCalendar's `datesSet` callback (identity-stable
   `useCallback([])`; `setVisibleRange` deduplicates by returning prev for unchanged
   bounds).

## Signed-off decisions

1. **Overlaps-the-range semantics for `expandTemplateOccurrences`**: the anchor starts one
   template-duration before `rangeStart`, so an overnight occurrence that began before the
   range is included. A moved occurrence is included wherever its new span lands. This
   prevents overnight sleep templates and cross-week moved occurrences from vanishing at
   the week boundary. Tests cover both behaviors explicitly.

2. **Past weeks now show template series**: before this step, templates rendered via
   FullCalendar's RRule plugin which expands infinitely in both directions. The reworked
   `expandTemplateOccurrences` does the same -- past weeks show template occurrences. This
   is accepted behavior (no seriesFloor fallback).

## What C.2/C.3 should know

- `CalendarEvent` start/end are `Date` objects (not ISO strings). Renderers that need
  wall-clock positions can call `getHours()`/`getMinutes()` directly.
- The view model carries NO layout information: position, overlap placement, and day
  slicing are C.2's concern.
- `TemplateCalendarEvent.moved` is there for the interaction layer: a moved occurrence
  behaves differently on scope prompts (C.3).
- The five-stream order in `buildCalendarEvents` is deliberate: renderers that sort by
  duration/start still fall back to array order to break ties.
- `toFullCalendarInput` is the only file that imports from `@fullcalendar/*` or
  `@/lib/theme` in the rendering path -- the view model itself is theme-free.
