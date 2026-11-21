# Emergent issues
- Display 3 days at a time in WeekStructureModal like in calendar?

- Progressive 'readying' of subtasks
- Subtasks that are just notes (ignore-in-engine boolean)

- 'Schedule X hours per week of this until.." - feature.

- Add full-day-items like "birthday"

- Guard for slow connection when waking server

# P5 — Medium features

- Mobile app (Capacitor wrap)

- Connect to Google Calendar and iCalendar
- Habits - dynamic items that schedule every week (repeating events with min/max size rendering within a given time frame)
- Allow moving/pinning of dynamic objects (temporarily acting like a plan)

# Future / deferred

- Undo/redo (smart to implement before optimistic DB updates on item edits)
- Add routines (tasks that are always bundled)

- Capture INSIDE a goal? ("Unprocessed subtask"?)
- Sorting captured items in folders? Or pre-assign to categories

- OSRM instead of Google Distance API — "self-host" means running their routing server yourself (hosting cost + setup but no per-request fee). No public-transport support in OSRM proper; would need GTFS data or a separate service.
- Customize themes (per-user style — architectural seam exists, no User schema column yet)
- Categorization of goals (tags) — may be redundant with categories; revisit
- Multiple templates of different time spans (3 days, 2 weeks etc)
- Multi-plan: option to create several life plans
- Per-screen wireframe extraction under `notes/design-rehaul/Wireframes/`
