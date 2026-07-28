# Calendar import (Google / iCal / Microsoft) — difficulty assessment & recommended approach

> **Status (2026-07-28):** All three phases are built. Phase 1 (ICS subscription import, BUSY/VISUAL modes, per-event exceptions, engine busy-blocks) and Phase 2 (Google Calendar OAuth + calendar picker) shipped earlier — the Google sensitive-scope verification paperwork is in progress. Phase 3 (Microsoft Graph) is now built too: `MicrosoftCalendarConnection` + `/api/integrations/microsoft/{connect,callback}` (common-tenant Entra OAuth, `Calendars.Read`), `actions/microsoftCalendar.ts`, Graph `calendarView` fetch with rotating-refresh-token persistence, and the Settings picker — see the "External calendars" section in CLAUDE.md. **Remaining ops work, not code:** register the Entra app (redirect URI `/api/integrations/microsoft/callback`, delegated `Calendars.Read` + `openid email offline_access`) and set `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` in dev + Vercel. Two-way sync remains out of scope. The plan below is the original assessment, kept as written.

## Context

Marcus asked how difficult it would be to import external calendars (Google Calendar, iCal, Microsoft/Outlook) into Circadium. `notes/TODO.md` already lists "Connect to Google Calendar and iCalendar" as a P5 medium feature. Nothing exists yet — no ics parsing, no calendar scopes, no Microsoft integration. The natural product shape: external events appear on the Circadium calendar as **read-only busy blocks the engine schedules around**.

## Verdict (TL;DR)

| Piece | Difficulty | Why |
| --- | --- | --- |
| Engine integration | **Easy** | External events are concrete `[start, end]` blocks — exactly what `buildAvailableSlots` already subtracts from the free-slot fabric. Zero changes to slot math. |
| App plumbing (model, fetch, redux, rendering, settings UI) | **Moderate** | Wide but well-trodden seam: ~12–14 files across 6 layers, all with existing patterns to copy. |
| iCal (.ics feed URL / file) | **Easy–moderate** | No OAuth. One parser covers Google, Outlook, AND Apple via their secret .ics feed URLs. |
| Google Calendar API | **Moderate + ops overhead** | Login OAuth has no calendar scope / no offline access today; needs an incremental-consent flow. `calendar.readonly` is a *sensitive* scope → Google app verification process for production. |
| Microsoft Graph API | **Moderate–hard** | No Microsoft identity at all today: Azure app registration + new OAuth flow + Graph delta queries, all greenfield. |
| Two-way sync (pushing Circadium's schedule out) | **Hard — recommend out of scope** | Conflict resolution against the engine's wholesale regen model; a different project. |

**Bottom line: an ICS-subscription v1 is a few days of focused work and covers all three providers read-only. The provider-native APIs are mostly OAuth/ops cost, not engineering novelty.**

## Key findings from exploration

- **Engine**: two fixed-busy pathways exist — weekly template masks (`masksToIntervals`) and concrete plan events (`buildPlanEvents` → `buildInitialEventArray`). `buildAvailableSlots` ([utils/calendar-generation/helpers/TimeSlotManager/buildAvailableSlots.ts](utils/calendar-generation/helpers/TimeSlotManager/buildAvailableSlots.ts)) converts every non-template `SimpleEvent` to occupied intervals and `findGaps` carves free slots. External events ride the plan/event pathway: build them as `SimpleEvent`-shaped blocks, feed them into `existingEvents`, done.
- **Auth**: `auth.config.ts` requests default scopes only — no `access_type: "offline"`, no refresh token stored, and session strategy is JWT so no token in session. The `Account` table already has `refresh_token`/`access_token`/`scope` columns (substrate exists, unpopulated).
- **Rendering**: four converters feed one FullCalendar array ([Calendar.tsx:220-229](app/(protected)/calendar/_components/Calendar.tsx#L220-L229)); a fifth `externalEventsToEventInput` is a known small quantity, keyed on `extendedProps.eventType`.
- **Recurrence**: `rrule` is already a dependency; recurring external events should be expanded server-side into concrete instances over the scheduling horizon (like plan occurrences) so the engine never learns RRULE.

## Recommended architecture (shared foundation, ~60% of the work)

1. **Two new Prisma models** (new file `prisma/schemas/models/externalCalendar.prisma`):
   - `ExternalCalendarSource` — per subscription: `kind` (`ICS | GOOGLE | MICROSOFT`), feed URL or provider calendar id, display name, color, `enabled`, `lastFetchedAt`, sync token/etag, **`mode` (`BUSY | VISUAL`)** — whether this source's events block the engine by default or render as a visual overlay only — and **`modeExceptions` (JSON string[] of provider event UIDs)** whose behavior flips the source default (BUSY source → listed events become visual-only; VISUAL source → listed events become busy). Provider UIDs are persistent (ICS `UID`, Google `event.id`, Graph `id`) and series-level for recurring events, so one exception covers all occurrences; per-occurrence overrides can come later via the composite occurrence id.
   - `ExternalEvent` — deterministic id `` `${sourceId}|${providerEventUid}|${occurrenceStart}` `` (CategoryEvent pattern), plus the bare `providerEventUid` as its own column (the exception key), `start`/`end`, `title`, `allDay`. Written wholesale per refresh with the delete+recreate diff pattern (TravelEvent precedent) — **not** mixed into `SimpleEvent`, which the engine owns. Whether an event is engine-busy is **derived** at engine-input time from `source.mode` + `modeExceptions`, never stored per event row — so a refresh can't clobber user choices, and flipping an exception is a one-row source update + regen, no re-import.
2. **Refresh path**: direct server action (Locations/travel-time pattern — `refreshExternalCalendar` fetches, parses, expands recurrence over the horizon, upserts rows, then the client re-fetches + `markSynced`). Staleness policy like `travelRefreshPolicy.ts` (TTL on page load, no cron needed for v1).
3. **Engine input**: thread `externalEvents` + sources through `CalendarPayload` → thunk → worker → `CalendarGenerator`. At the input boundary, filter to effectively-busy events (`mode` + `modeExceptions` resolution, mirroring the `applyQueueCategoryInheritance` input-substitution pattern) and merge them as `SimpleEvent`-shaped blocks into `existingEvents` before `buildAvailableSlots`; visual-only events never reach the engine. All-day events likely opt-in as busy (default: not blocking).
4. **Plumbing checklist** (all existing patterns): `types/prisma.ts`, `fetchCalendarData`/`fetchFreshState`, redux (`engineOutputSlice`-style read-only slice — external events are not user-authored, so they can stay OUT of the OCC diff sync entirely, like view state), `CalendarProvider`, `externalEventsToEventInput` renderer + non-interactive guard in drag/resize handlers.
5. **Settings UI**: a "Connected calendars" section (settings or locations-style page) listing sources with add/remove/enable/color and the per-source mode picker (busy vs visual). Per-event override lives where you'd expect it: clicking an external event on the calendar opens its (read-only) popover with a "Blocks scheduling" toggle that writes the UID into `modeExceptions` via a direct server action and triggers a regen.

## Phasing

- **Phase 1 — foundation + ICS subscription (recommended v1).** Paste a secret .ics URL (Google, Outlook, and Apple all export one) or upload a file. Parse with `node-ical` or `ical.js` server-side. Covers all three providers read-only with zero OAuth. Effort: the foundation above + a parser module + settings UI.
- **Phase 2 — Google Calendar API.** Incremental-consent OAuth (separate from login; store refresh token on the `Account` row), `calendarList` + `events` with `syncToken` incremental sync. Better freshness and multi-calendar picking than ICS polling. Ops cost: Google OAuth verification for the sensitive scope (privacy policy, verification review — calendar is sensitive, not restricted, so no CASA security audit).
- **Phase 3 — Microsoft Graph.** Azure AD app registration, Microsoft Entra provider or standalone OAuth, `calendarView` with delta queries. Same shape as Phase 2 but everything new.

## Main design decisions to settle before building

- ~~Busy blocks vs visual-only~~ **Settled: both, per source, with per-event exceptions** — `mode: BUSY | VISUAL` on the source + a `modeExceptions` UID array flipping the default per event. Never convert imports into Planner plans (they'd drift from the source and collide with the AI draft contract); the source of truth stays external.
- Whether all-day events block scheduling (suggest: no by default, per-source toggle).
- Timezone handling: store UTC instants, render local — matches how plans already work; floating-time ICS events need a documented convention (interpret in user's local zone).

## Verification (if built)

- Unit tests for the ICS parser + recurrence expansion (fixture .ics files from Google/Outlook/Apple exports).
- Engine regression test in the fixture pattern: an external busy block over a free span → no task placed inside it; the same event with its UID in `modeExceptions` → the span is free again; idle regen re-emits identical rows (stable-regen parity).
- Manual: subscribe a real Google secret address, confirm blocks render read-only and the scheduler routes around them.
