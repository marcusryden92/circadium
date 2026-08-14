# Circadium → React Native: strategy & migration plan

## Context

Circadium's calendar surface is built on FullCalendar, which is DOM-only and cannot run in React Native. The goal is a dedicated native app. Decisions locked in:

- **v1 scope: full-parity calendar editor** (drag/resize with inline engine regen, scope modals, template editing)
- **Code sharing: pnpm monorepo** with shared packages consumed by web and RN
- **No WebView calendar** — native-feeling only (the `notes/capacitor-plan.md` WebView track is not this path)
- **Toolchain: Expo** (managed + EAS)
- **Dedicated backend first: C#/ASP.NET Core, full migration of all server actions before mobile UI work.** Drivers: offline push notifications, WebSockets for instant multi-client sync, learning .NET, and a possible future Rust engine worker for collaborative/enterprise scenarios (a separate backend layer orchestrating a native worker fits ASP.NET naturally).

Grounded in three codebase explorations (FullCalendar coupling, portability audit, backend surface) plus 2026 package research.

---

## (a) What can be reused almost verbatim

Web coupling is concentrated in four narrow places; the app's real logic is clean pure TypeScript. **Everything below is client-side and unaffected by the C# backend** — the backend changes what's on the other end of the wire, not the client code.

### Portable verbatim (pure TS + date-fns — no changes)

| Layer | Location |
|---|---|
| **The entire scheduling engine** | `utils/calendar-generation/**` (117 of 119 files; `generateCalendar` has zero worker knowledge) |
| **All Redux state** | `redux/` — 9 slices + thunks (verified import-clean) |
| **The whole AI assistant engine** | `utils/draft/**` incl. `assistantEngine/` (`partial-json` + Anthropic SDK are Hermes-fine) |
| **Every domain helper** | `planRecurrence`, `recurringPeriods`, `allowedTimes`, `taskSplitting`, `precedence/`, `queue-handlers/`, `goal-handlers/`, `goalPageHandlers`, `plannerCompletion`, `habits/habitStats`, `eventTier`, `datetime/`, … |
| **The sync/OCC client** | `compareData` diff (pure); debounce/backoff/stale-adoption in `useCalendarServerSync` — only coupling is ONE line calling the `syncCalendarData` action (becomes a fetch to the C# API) |
| **Calendar mutation logic** | All `apply*` functions in `utils/calendarEventHandlers.ts` + `template-handlers` (FC handlers are thin adapters pulling only `{id, start, end, title, extendedProps}`) |
| **Popover/modal domain logic** | `RecurrenceScopeModal`/`NewPlanModal`/`WindowExceptionEditor` logic, WeekStructureModal's `eventSerializers`/`timeWindow`/`useWeekStructureState` |

### Portable with a thin shim

| What | File | Shim |
|---|---|---|
| Engine Web Worker | `utils/calendar-generation/engineWorkerClient.ts` | **Already self-degrades**: synchronous inline fallback when `typeof Worker === "undefined"` (true on Hermes). Off-thread later via worklets. |
| Anthropic streaming | `assistantEngine/anthropicClient.ts` | RN fetch doesn't stream bodies → inject `expo/fetch`. Client factory is the seam. |
| BYOK key crypto | `lib/aiKey.ts` | `crypto.subtle` → native keystore redesign (below). |
| Event converters | `utils/calendar-rendering/*` | Logic ports; theme `vars` + FC `EventInput` output retarget. |
| Small hooks / analytics | `useIsMobile`, `usePlatform`, `usePopoverPosition`; `posthog-js` | RN primitives; `posthog-react-native`. |

### Must be rebuilt

- **The two FullCalendar surfaces** — `Calendar.tsx` + `WeekStructureModal.tsx` bodies, the `EventWrapper` ResizeObserver/`.fc-event-selected` bridge, the two `.fc-*` stylesheets.
- **The server side** — every backend call today is a Next server action gated on the NextAuth cookie (no JSON API, no CORS, no bearer path). Superseded by the C# backend below. The server-side TS being replaced: the OCC sync transaction + 14 handlers, auth flows (credentials + custom 2FA), Google/Microsoft OAuth token refresh, ICS parsing (`node-ical`), Places/Routes calls, Resend email.
- **BYOK vault storage** — `lib/aiKey.ts` stores a non-extractable `CryptoKey` in IndexedDB; no native equivalent → `expo-secure-store`. Sole consumer is `AiAccessContext.tsx`; boundary is one file behind the same exports.
- **Styling** — vanilla-extract is web-only; `lib/theme/scales.ts` numerics port as RN theme tokens.
- **localStorage/sessionStorage** → AsyncStorage/SecureStore.
- **`types/prisma.ts` enum decoupling** — it runtime-re-exports 5 Prisma enums (`PlannerType`, `EventType`, `UserRole`, `ExternalCalendarKind`, `ExternalCalendarMode`), dragging the generated Prisma client into any importing bundle.

### The FC feature surface a replacement must provide

Standard: timeGrid week/3-day/day, 30m slots, 5m snap (15m in WeekStructureModal), `firstDay` pref, now-indicator, no all-day slot, custom day headers, drag-move + both-edge resize, drag-select-to-create, overlap packing, 300ms long-press, imperative goto/view-switch. **The four hard ones:** (1) background events (category windows); (2) client-side rrule+exdate — *templates only*, plans arrive pre-expanded from the engine; (3) arbitrary React tile content sized to live geometry (5 renderers, 3-tier layout); (4) the drag interaction state machine (`revert()`, mirror validation, oldEvent reads).

---

## (b) Recommended packages & course of action

**Calendar: [`@howljs/react-native-calendar-kit`](https://github.com/howljs/react-native-calendar-kit)** (MIT, active, Expo-compatible, Reanimated + Gesture Handler):

- Week/3-day/day views (no month view — Circadium doesn't use one), pinch zoom, timezone support, haptics, drag-to-create/edit with configurable step.
- `renderEvent` = fully custom tiles receiving width/height SharedValues → direct analog of the `eventContent` + ResizeObserver tier pattern.
- `unavailableHours` accepts **date-string keys**, multiple regions/day, per-region colors → maps 1:1 onto engine-materialized `CategoryEvent` occurrences (exceptions pre-applied), and regions don't join overlap packing (matches `display:"background"`). `renderCustomUnavailableHour` for pinstripe/trespass.
- Gaps closed in our translation layer: no client-side rrule (pre-expand templates per visible range, mirroring `templatesToEventInput`); controlled-component semantics replace `revert()` (cancel = don't dispatch — *simpler* than FC's dance).
- **Escape hatch:** MIT and ~1/50th FullCalendar's surface — vendor-fork it if the spike fails.

Rejected: Wix `react-native-calendars` (agenda-oriented), `react-native-big-calendar` (too simple), Mobiscroll (commercial), WebView (ruled out).

Supporting stack: Expo + EAS, `expo-secure-store`, `expo/fetch`, `@gorhom/bottom-sheet`, AsyncStorage, `expo-web-browser` (OAuth handoff), `posthog-react-native`. Backend: ASP.NET Core, SignalR, Hangfire, Npgsql/EF Core (database-first), NSwag.

## (c) Fork FullCalendar for mobile?

**No.** FC's rendering core is Preact emitting real DOM, laid out by CSS with DOM measurement, driven by a DOM-event interaction engine (mirrors, hit-testing, `revert()`). A fork keeps only option semantics and date math — precisely the parts Circadium *doesn't need* (the engine owns placement; `rrule`/date-fns run on Hermes as-is). The effort equals writing a new calendar from scratch while inheriting an architecture that fights RN. If forking is ever warranted, fork **calendar-kit**, not FullCalendar.

---

## Target architecture

### 1. Monorepo (pnpm workspace) — unchanged by the backend decision, still first

```
Lifeplan/
├── pnpm-workspace.yaml          # ["apps/*", "packages/*"] + catalog (pins RTK/date-fns/luxon/rrule/zod/uuid)
├── tsconfig.base.json
├── apps/
│   ├── web/                     # ENTIRE current Next app moved verbatim (keeps "@/*": ["./*"])
│   ├── api/                     # C# solution (or sibling repo — see §2; monorepo keeps contracts adjacent)
│   └── mobile/                  # Expo app (expo-router; src/features/calendar, src/api, src/providers)
└── packages/
    ├── contracts/               # the 5 shared enums + ~25 model types re-declared as plain TS (no Prisma import — this is what lets Prisma be deleted at cutover) + Zod schemas + wire types (BootstrapPayload, SyncRequest/Response, DatabaseChanges) → OpenAPI generation
    ├── domain/                  # planRecurrence, recurringPeriods, allowedTimes, taskSplitting, precedence/, queue-/goal-handlers, plannerCompletion, habits, datetime, external-calendar client-safe parts…
    ├── engine/                  # utils/calendar-generation minus the worker construction
    ├── calendar-core/           # pure apply* split from calendarEventHandlers, eventTier, WSM pure logic, NEW expandTemplateOccurrences()
    ├── state/                   # 9 slices + thunks + makeStore() factory
    ├── sync/                    # compareData + handleServerTransaction/useCalendarServerSync parameterized on an injected SyncTransport
    └── draft/                   # utils/draft incl. assistantEngine (injectable client factory)
```

Key mechanics:
- **Move whole app first** (`git mv` → `apps/web`): the `@/*` alias is app-relative so every import survives verbatim. Config-only edits: Vercel Root Directory → `apps/web`, `prisma.config.ts`, docker-compose, jest `dir`. Zero source edits.
- **Per-extraction re-export shims** at old paths (`apps/web/utils/dateUtils.ts` → `export * from "@circadium/domain/dateUtils"`). Packages ship TS source (no build): `transpilePackages` in `next.config.mjs`; Metro transpiles natively; deep subpath exports (`"./*": "./src/*.ts"`).
- **Prisma decoupling**: enums re-declared in contracts as const-object + literal-union; model types hand-written carrying existing overrides; **type-level conformance asserts in `apps/web`** (`Expect<Equal<contracts.Planner, Prisma.PlannerGetPayload<undefined>>>`) fail `pnpm type-check` when a migration drifts a shared shape. `apps/web/types/prisma.ts` becomes a shim.
- **Contracts → OpenAPI → C#**: generate an OpenAPI spec from the contracts package (`zod-openapi`); NSwag generates C# DTOs/controller interfaces from it. The TS contracts package is the single wire-format authority for all three apps.
- **Worker seam**: `packages/engine/src/engineClient.ts` keeps protocol + inline fallback with optional injected `spawnWorker`; `apps/web/lib/engineWorker.ts` keeps `engine.worker.ts` + `new Worker(new URL(...))` (a bundler-level construct Metro chokes on) and calls `configureEngineClient` at bootstrap. Thunk imports unchanged; web bit-identical; mobile gets inline default.
- **Jest**: web keeps `next/jest`; packages get minimal node-env `@swc/jest` configs; pure tests move with their code. Root `pnpm -r test` / `type-check`.
- **Sequencing** (each step green on `pnpm -r type-check && pnpm -r test && pnpm --filter web build`): 0.1 workspace re-shape → 0.2 contracts → 0.3 domain → 0.4 engine → 0.5 calendar-core (pure core moves; FC-typed adapters stay in web) → 0.6 state → 0.7 sync (transport injection; web transport = 5-line action adapter, later swapped for the C# fetch) → 0.8 draft.

### 2. Dedicated .NET backend (ASP.NET Core) — full migration before mobile

**Stack**: ASP.NET Core minimal APIs or controllers; **SignalR** (realtime), **Hangfire** or Quartz (push scheduling + background refresh jobs), **Npgsql + EF Core** (or Dapper for the hot sync path). Postgres enums map via Npgsql.

**Prisma is transition scaffolding, not an end-state choice.** Schema authority follows whichever side's code still touches the DB — never two migration systems owning one database:
- *During coexistence (Phases 0–2)*: Prisma stays migration authority, because the still-live TS server actions run on the Prisma client, which is generated from the Prisma schema. EF Core scaffolds **database-first** as a read-only consumer of the schema.
- *At cutover (end of Phase 2)*: **Prisma is deleted entirely** — baseline the current schema into EF Core code-first migrations (scaffolded model → `migrations add Baseline`, marked applied), remove `prisma/`, the generated client, and the driver adapter from `apps/web`, port the seed to C# (or keep the TS seed as a dev-only tool briefly). EF Core owns migrations outright from then on.
- The contracts **conformance asserts** (contracts types vs Prisma payload types) are transition-period guards and retire at cutover; after it, the contracts package + generated OpenAPI are the wire authority and NSwag-generated C# DTOs are the drift check on the .NET side.

**Auth model** — C# is the token issuer/resource server; NextAuth stays as web's thin identity frontend:
- New `MobileSession`-style table (works for web too): `{id, userId, tokenHash, expiresAt, lastUsedAt, deviceName}`. Access = short-TTL JWT (`aud: "circadium-api"`); refresh = opaque hashed + rotated with reuse detection.
- **Web**: user logs in via NextAuth exactly as today (OAuth config, 2FA UX, cookies untouched); the Next server then exchanges a short-lived signed assertion (asymmetric keypair — Next signs, C# verifies) for C# API tokens the browser uses directly. CORS on the C# API for the web origin. End-state refinement: NextAuth's `authorize()`/user reads call C# endpoints instead of Prisma, making Next fully data-layer-free.
- **Mobile**: native credentials + 2FA form posts to C# directly; OAuth (Google/GitHub) via system-browser handoff — `expo-web-browser` opens the web login, the landing page mints a one-time 60s handoff code (bound to the session's userId), deep-link `circadium://auth?code=…`, exchanged at C# for the token pair. One flow covers all providers; generalizes the `NativeHandoffToken` sketch in `notes/capacitor-plan.md`.

**The sync port (the invariant-dense core)**: `POST /calendar/sync` reimplements the OCC transaction — gate on `UPDATE users SET data_version = data_version + 1 WHERE id = @userId AND data_version = @clientKnown` (0 rows → rollback → return `{reason:"stale", freshState}`), then the 14 table handlers in FK-safe order with bulk `UPDATE ... FROM (VALUES ...)` statements (port of `sync-handlers/bulkUpdate.ts`), empty-diff short-circuit without version bump, 60s timeout semantics. `POST /calendar/bootstrap` returns the documented payload + locations + travelTimes. **Golden contract tests are non-negotiable**: record real `DatabaseChanges` payloads + DB states from the TS implementation, replay against C# in a test database, diff resulting rows — run the corpus in CI until cutover.

**Realtime (the WebSocket goal)**: a SignalR hub with per-user groups carrying **dataVersion-bump pings only** — no data on the wire. Every successful sync publishes `{dataVersion}` to the user's group; other clients compare and, if behind, run the **existing stale-adoption path** (fetch fresh state → `adoptFreshServerState` wholesale) — client machinery that already exists and is battle-tested. Instant multi-client sync ≈ a server ping + code you already have. (Carrying actual diffs over the socket is a later optimization, not v1.) RN + web both use the SignalR JS client; fall back to plain WS if RN gives trouble.

**Push notifications** — two tiers:
1. **Local scheduled notifications** (no server needed): the mobile app schedules the next ~48h of "task starting" notifications from the synced calendar on every sync/foreground, via `expo-notifications`. Works offline; covers most reminder value.
2. **Server push** (C# + Hangfire → Expo Push API or FCM/APNs): for what the device can't know — changes made on another device while the app is closed, digest nudges, deadline alerts. Scheduler reads engine-output events from the DB (they're synced/persisted already).

**Migration order** (strangler, group by group; web switches per group via its transport seams; each group has an actions-vs-API parity test before the server-action version is deleted): (1) bootstrap + sync + SignalR ping — the core, proven by web in production before anything else migrates; (2) occurrenceCompletions, viewState, settings, scheduling; (3) categories, locations (Places/Routes calls + travel budget logic), habits; (4) externalCalendars (ICS parsing via Ical.Net, Google/Microsoft token refresh incl. Microsoft's rotating refresh tokens), draftConversations; (5) auth flows (register/reset/verification email via an SMTP/API mail provider), feedback, data export/import, onboarding, admin. End state: Next has no server actions and no Prisma; it's a frontend host + identity UX.

**Rust future (noted, not built)**: the engine stays client-side and authoritative (clients compute placements, sync persists them — engine-derived tables are wholesale-written with deterministic ids, so the contract tolerates a future server-side writer). A collaborative/enterprise mode would move engine execution server-side behind the same API, as a Rust worker process the C# layer orchestrates. Nothing in the C# design needs to anticipate it beyond keeping engine-derived-table writes in one module.

### 3. Native calendar (`apps/mobile/src/features/calendar/`)

- `CalendarScreen.tsx` — calendar-kit `CalendarContainer/Header/Body`; `numberOfDays` 7/3, `firstDay` pref, `dragStep={5}`, controlled `events`, ref `goToDate`. `useCalendarEvents.ts` — memoized selector pipeline emitting a **referentially stable** `EventItem[]` (the RN analog of FC's identity-stability rule).
- **Five streams** via mobile-local `converters/` (hard logic in `calendar-core`): (1) plans/tasks = direct mapping (engine pre-expands); (2) **templates** = `expandTemplateOccurrences(templates, exceptions, visibleRange ± 2wk)` mirroring `templatesToEventInput` (deleted → skipped, moved → one-off occurrences; ids `${templateId}::${occurrenceISO}` feed `resolveTemplateOccurrence`); (3) **category windows** = date-keyed `unavailableHours` from CategoryEvents (+`renderCustomUnavailableHour` for pinstripe/trespass); (4) travel + (5) external = non-editable EventItems (all-day external dropped, parity).
- `renderers/` — the five tile renderers as RN views dispatched by `extendedProps.eventType` inside `renderEvent`; tier via width/height SharedValues + `useAnimatedReaction` → same `eventTier` thresholds.
- **Interactions → existing pure handlers.** Central simplification: **calendar-kit is fully controlled, so `revert()` disappears — cancel = don't dispatch.** "Tile stays at drop position while the scope sheet is open" = a local `pendingEdit` overlay `{eventId, start, end}` composited onto emitted events; confirm dispatches `applyOccurrenceMove`/`applySeriesMove`/`applyTemplate*` + clears; cancel clears only (tile snaps home). Create: `onDragCreateEventEnd` → `NewPlanSheet` → `createPlanFromSelection`. Resize: bottom → `applyEventResize`, top → `applyEventStartEdit`. Validation moves from mid-drag (`eventAllow`) to drop-time (same predicates; haptic + toast on reject) — accepted v1 divergence. Tap → `EventActionsSheet` (@gorhom/bottom-sheet) with complete/postpone/title/color/delete. After every commit: dispatch → inline regen → sync debounce (identical pipeline minus worker).
- **WeekStructureModal equivalent**: expo-router modal route hosting a second calendar instance (`dragStep={15}`, day view on phones), template-stream-only, reusing `useWeekStructureState`/`eventSerializers`; overlap validation at drop time; generic week anchored to a fixed reference week with weekday-only headers.

### 4. Engine + sync on mobile

- **v1: engine inline on Hermes** (self-degrading client). Mitigations: schedule regens via `InteractionManager.runAfterInteractions`, visible "recalculating" state, existing debounce/coalescing. Reanimated keeps gestures/scroll live on the UI thread during the freeze. **Post-v1**: offload to a second JS runtime (`react-native-worklets` `createWorkletRuntime`) — the §1 seam means this touches only mobile client config; needs a mini-spike (117-file graph loadable, serializable I/O).
- **Sync**: `@circadium/state` + `@circadium/sync` verbatim; mobile transport = bearer fetch to the C# API. `CalendarDataProvider` mirrors web's CalendarProvider orchestration. Multi-client concurrency is already OCC's job; SignalR pings make it *instant* rather than eventual. `AppState` active → version check → adopt if behind; background → flush pending sync. True offline queueing out of v1.

---

## Phased roadmap

| Phase | Scope | Effort | Exit criteria |
|---|---|---|---|
| **0 — Monorepo extraction** | Workspace re-shape + 7 package extractions; web behavior unchanged | **L** | `pnpm -r test`/`type-check`/web build green; prod deploy from `apps/web` verified |
| **1 — C# backend core** | Solution + EF Core scaffold, token auth (web assertion exchange + mobile credentials/handoff), bootstrap + **OCC sync port with golden contract tests**, SignalR dataVersion hub; **web switches sync transport + gets live pings** | **XL** | Golden corpus green; web running on C# sync in production; two browsers show instant cross-client updates |
| **2 — Full action migration + push** | Remaining action groups (§2 order) with per-group parity tests; Hangfire push scheduler + `expo-notifications`-ready pipeline; Next ends data-layer-free; **Prisma deleted, EF Core baselined as migration owner** | **XL** | No server actions and no Prisma remain; web fully on C#; a scheduled push reaches a test device |
| **3 — Expo shell + read-only calendar + SPIKE GATE** | Scaffold (expo-router, reanimated, gesture-handler, SecureStore, EAS); **spike first**; auth screens (credentials + handoff); all five streams rendering read-only; local notifications tier | **L** (spike M) | Spike verdict recorded (package / patch / vendor-fork); visual parity read-only on device |
| **4 — Interactions** | Tap sheets, drag/resize/create, `pendingEdit` + scope sheets, drop-time validation, inline regen + sync loop + SignalR adoption | **XL** | Every Calendar.tsx interaction reproducible on device incl. scope-cancel snap-back; edit on web appears on device instantly |
| **5 — Template editing + surfaces** | WSM-equivalent screen, template scope flows, `WindowExceptionSheet`, settings/view-state | **L** | Full-parity editor end-to-end |
| **6 — AI assistant** | BYOK on SecureStore (same export interface — simpler than web's IndexedDB ceremony), `expo/fetch` streaming injected into the client factory, draft UI port | **L** | Assistant streams + applies a draft on device |
| **7 — Post-v1** | Worklet engine offload, native OAuth polish, offline queueing, diff-over-socket, Rust engine exploration | — | — |

### The Phase-3 spike (gate before production converters)

Throwaway screen validating: (1) `dragStep` 5/15-min; (2) **top-edge resize** (highest-consequence gap; fork-add if absent); (3) per-event drag disable; (4) date-keyed `unavailableHours` at ~50+ regions/week + per-region custom-renderer payload; (5) **the `pendingEdit` controlled-overlay pattern** — drop → sheet → cancel → snap-back with no internal-state fight (riskiest assumption); (6) SharedValue tier renderers; (7) ~300 events/week at 60fps on mid-range Android; (8) `goToDate`, 7↔3-day, `firstDay`, now-indicator; (9) header/day-bar customization. **Decision rule:** all pass (or patch-package-sized fixes) → npm package; structural gaps → vendor-fork calendar-kit into `packages/vendor/`; only if the controlled-events model itself fights us does a custom Reanimated build enter (XL but bounded: gestures + virtualized day columns + absolute tiles — engine owns placement, calendar-core owns semantics).

### Risks (ranked)

1. **The C# sync-transaction port** — most invariant-dense code in the system (OCC gate, FK order, bulk updates, empty-diff rule). Mitigation: golden contract tests + web as first production consumer long before mobile exists.
2. calendar-kit internal drag state vs the `pendingEdit` overlay (spike item 5).
3. Top-edge resize availability (spike item 2).
4. Dual-backend drift during Phase 2 (both stacks touching one DB). Mitigation: strangler per group, parity test before each server-action delete, Prisma as sole migration authority during coexistence (deleted at cutover).
5. Date-keyed `unavailableHours` at volume + custom-renderer payload (spike item 4).
6. Metro + pnpm workspace linking (mitigation: `node-linker=hoisted` in root `.npmrc`).
7. Inline regen duration on mid-range Android (measure in Phase 4; worklet offload is the pressure valve).

---

## Verification

- **Phase 0, every step**: `pnpm -r type-check && pnpm -r test && pnpm --filter web build` green; after 0.1, prod deploy from `apps/web` + manual smoke of calendar drag/resize/sync (extraction must be behaviorally invisible). Conformance asserts must fail the build when a Prisma enum member is renamed (test by renaming one temporarily).
- **Phase 1**: the golden corpus — recorded real `DatabaseChanges` payloads replayed against TS and C# implementations with row-level DB diffs — green in CI; e2e: login → bootstrap → mutate → sync → forced stale (mutate via second session) → freshState adoption; two browser sessions demonstrate ping-driven instant adoption; verify a web cookie can't call the C# API without the token exchange and vice versa.
- **Phase 2**: per-group parity test (same request via server action and C# route → identical DB effect + response) before deleting each action group; scheduled push arrives on a test device with the app closed.
- **Phase 3 spike**: run on physical mid-range Android + iPhone via dev build; record the gate verdict in the repo before writing production converters.
- **Phases 4–5**: side-by-side parity against web — each interaction in `Calendar.tsx`/`WeekStructureModal.tsx` (drop, both-edge resize, create, occurrence vs series scope, cancel snap-back, template exceptions) performed on device produces the same Redux dispatch + sync diff as web's for the same gesture; engine regen output identical (same `SimpleEvent` ids) for the same inputs; cross-device: edit on web appears on device without user action.
- **Phase 6**: BYOK round-trip on device (store → kill app → load → decrypt → stream a turn); the key never appears in logs or requests to the C# API.
