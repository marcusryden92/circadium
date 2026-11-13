# Circadium Onboarding — Handoff

First-run onboarding is a guided six-step setup a user runs once. It seeds their life areas,
places, weekly rhythm, and a first brain-dump of goals, then hands off to the AI assistant to turn
those into a schedulable plan.

- **Branch:** `feature/onboarding`
- **Status:** type-check + tests green; **not yet run live** (needs dev server + DB + an un-onboarded user)
- **Gate:** server-rendered (no dashboard flash), overlay-based (URL stays `/dashboard`)

---

## 1. The gate — who sees it, and when

Onboarding is an **overlay inside the app shell**, not a separate route. The decision to show it is
made on the server before first paint.

- `app/(protected)/layout.tsx` is an **async server component**. It reads `onboardedAt` for the
  session user, computes `needsOnboarding`, and passes it to `ProtectedProviders`.
- `app/(protected)/ProtectedProviders.tsx` (client) holds the provider tree (Store · User · Calendar)
  + `AppShell`, and threads `needsOnboarding` into the overlay slot.
- `app/(protected)/onboarding/OnboardingOverlay.tsx` seeds its initial visibility from that prop — no
  client `useEffect`, no round-trip, no flash.

Lifecycle:

| Event | Behavior |
| --- | --- |
| gate | `onboardedAt == null` → show overlay |
| finish | `completeOnboarding()` stamps `onboardedAt` |
| skip | same stamp; the dashboard SetupChecklist is the fallback |
| resume | step + drafts persist in `localStorage` (see §4) |

**Trade-off taken:** no `/onboarding` route and one lightweight `onboardedAt` query per full page
load, in exchange for zero JWT/middleware surgery — no redirect loops, no stale-flag lockout after
finishing. (The alternative, a middleware redirect keyed off a JWT `onboarded` claim, was considered
and declined.)

---

## 2. The six steps

`OnboardingFlow.tsx` is a `switch` over `stepIndex` (`TOTAL_STEPS = 6`). It **commits as it
advances** — each step's data is written to Redux on Continue, so a mid-flow drop-off still leaves
real rows behind.

| # | Step | What it commits |
| --- | --- | --- |
| 0 | Welcome | Nothing. Get started, or Skip setup (stamps `onboardedAt`, exits). |
| 1 | Areas | `commitAreas` → top-level `Category` rows (sortOrder from array order). Two-column picker, add · remove · drag-to-reorder, custom add. |
| 2 | Places | `createLocation` (direct action) + `markSynced`. Google Places rows + default transport mode; warms the travel-time matrix. |
| 3 | Week | `commitWeek` → `buildWeekTemplates` (sleep template) + `applyWorkCategory` (working hours → windows on a Work sub-category). Combobox location picker. |
| 4 | Brain dump | `commitBrainDump` → upsert-by-id triaged `Planner` rows. Jot items, mark each task/plan/goal; deadlines/areas/durations deferred to the AI step. |
| 5 | AI assistant | Embedded `AIDraftModal`, `intent="onboarding"`. Save & continue → apply + finish. |

---

## 3. File map

Everything is under `app/(protected)/onboarding/` unless noted. Pure builders live in `_lib/` and are
unit-tested; `_steps/` and `_components/` are UI only.

**Gate & shell**

- `app/(protected)/layout.tsx` — server component; reads `onboardedAt`, computes `needsOnboarding`.
- `app/(protected)/ProtectedProviders.tsx` — client provider tree + AppShell; threads the flag to the overlay.
- `onboarding/OnboardingOverlay.tsx` — chromeless full-canvas overlay; initial visibility from the server prop.
- `actions/onboarding.ts` — `completeOnboarding()` stamps `onboardedAt`. (`getOnboardingStatus` is now unused — see §7.)

**Flow & steps**

- `onboarding/OnboardingFlow.tsx` — state owner + step switch + all commit callbacks + progress persistence.
- `_steps/WelcomeStep.tsx` — step 0.
- `_steps/AreasStep.tsx` — step 1; two-column picker + reorder logic.
- `_steps/PlacesStep.tsx` — step 2; location creation, transport, travel warming.
- `_steps/WeekStep.tsx` — step 3; sleep/work form, Combobox location.
- `_steps/BrainDumpStep.tsx` — step 4; jot + type SegmentedControl.
- `_steps/OnboardingAIStep.tsx` — step 5; embeds `AIDraftModal`, owns Save/Finish.
- `_components/StepFrame.tsx` — shared frame (progress segments, title, body, footer).
- `_components/LocationRows.tsx` — Places row editor (Google autocomplete).

**Pure libs (tested)**

- `_lib/starterCategories.ts` — area presets + `buildStarterCategories`.
- `_lib/weekTemplates.ts` — `buildWeekTemplates`, `expandDailyRange` (splits overnight at midnight).
- `_lib/workCategory.ts` — `applyWorkCategory` (Career + Work sub-category with windows, `useTimeWindows: true`).
- `_lib/brainDumpRows.ts` — `DumpItem`, `buildBrainDumpRow`, `durationForType`.
- `_lib/onboardingProgress.ts` — `StoredProgress` v2, `migrateProgress`, `PROGRESS_KEY`.

**AI step surface**

- `components/draft/AIDraftModal/AIDraftModal.tsx` — `intent` tuning: empty-state hint, no History popover, no auto-resume.
- `app/api/draft/stream/route.ts` — onboarding preamble (`intentBlock`).
- `utils/draft/applyDraftForestToPlanner.ts` — save-time reverse parser; any node with children persists as a goal.

---

## 4. State, commit & resume

Every step writes through the normal calendar data path — Redux `updateAll` / `updatePlannerArray` →
engine regen → debounced diff sync. Onboarding invents no bespoke persistence; it seeds the same rows
the rest of the app edits.

```
# commit-as-you-advance (per step, on Continue)
Areas   -> commitAreas       -> updateAll(categoriesUpdater)   # dedupe by name
Places  -> createLocation    -> direct action + markSynced
Week    -> commitWeek        -> updateAll(templates, categories)
Dump    -> commitBrainDump   -> updatePlannerArray(upsert-by-id)
AI      -> assistant.save    -> updateAll(planner, templates, categories)

# idempotency — re-commit on Back/forward replaces, never stacks
weekTemplateIds   Set<id>   # template ids this flow owns
dumpCommittedIds  Set<id>   # dump ids; removal drops the subtree via getTaskTreeIds
DumpItem.id       uuid      # minted at jot time == the Planner row id
```

**Progress persistence.** `localStorage["circadium.onboarding.progress"]` holds
`{ version, stepIndex, weekTemplateIds, dumpItems, dumpCommittedIds }`. The persist effect includes
`dumpItems` so jots survive a reload. `finish()` clears the key.

**Schema migration (v1 → v2).** `migrateProgress` normalizes any payload. A versionless (v1) blob
predates the brain-dump step: its AI step at index 4 remaps to **5**, and the new dump fields default
empty. Non-string ids are filtered out.

---

## 5. Engine fix — the untriaged landmine (critical, fixed this branch)

The scheduling engine had **no `isTriaged` filter**. A zero-duration task or a start-less plan fails
validation, and any validation failure makes the generator return **empty events** — the calendar
blanks. This was already live: a Capture-inbox jot poisoned every regen while it sat in the inbox,
and the brain-dump step (triaged plans with no start) would trip the same mine.

- **Filter:** `calendarGeneration.ts` drops `isTriaged === false` rows at the input boundary.
- **Downgrade:** `validatePlanners.ts` — plan-missing-`starts` is now a warning, not an error
  (`buildPlanEvents` already null-guards it).
- **Goal type:** `applyDraftForestToPlanner.ts` — a node with children persists as a **goal**
  regardless of the model's label.

Guarded by the `calendar-generation` regression suite; all fixtures are `isTriaged: true`, so the
filter never drops them.

---

## 6. Data model & tests

**Schema.** One new column: `User.onboardedAt` (nullable `DateTime`), migration
`20260705120000_add_user_onboarded_at`. Areas → `Category`, week → `EventTemplate` +
`CategoryTimeWindow`, dump → `Planner` — all existing tables.

**Tests.** `__tests__/onboarding/onboardingHelpers.test.ts` covers `buildStarterCategories`,
`expandDailyRange`, `buildWeekTemplates`, `applyWorkCategory`, `buildBrainDumpRow`, and
`migrateProgress`. The `draft/` and `calendar-generation/` suites stay green.

---

## 7. Status & open threads

**Done** (verified by type-check + tests)

- Six-step flow with commit-as-you-advance + idempotent recommits.
- Server-rendered gate — no dashboard flash.
- Progress v2 schema + v1 migration.
- Engine untriaged filter + plan-starts + goal-nesting fixes.
- Areas drag-to-reorder; week Combobox; global `color-scheme` for native inputs (dark-mode fix).

**Open** (caveats & follow-ups)

- **Not run live yet.** Needs dev server + DB + an un-onboarded user to eyeball the whole flow.
- Areas support **reorder, not nest** — nesting stays on the Categories page.
- Goal-nesting fix applies at **Save**; the live AI tree pane still shows the model's label mid-session.
- Areas/location prefill runs once in `useState` initializers — late Redux hydration can miss it (accepted).
- `getOnboardingStatus` is now unused; delete or keep as a companion to `completeOnboarding`.
- Dark-mode is sticky via `localStorage` and onboarding is chromeless (no toggle) — consider a system-pref default.
