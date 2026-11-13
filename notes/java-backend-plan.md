# Circadium → Java backend + Expo app: production migration plan

## Context

Circadium is becoming a company. The product needs WebSocket-driven multi-session sync (no data conflicts between two open sessions), app-closed push notifications, and a real mobile app — none of which the current Next.js server-action + Prisma architecture can provide. The backend is therefore replaced by a **dedicated Spring Boot API**, the repo becomes a monorepo (`client/web`, `client/mobile`, `client/shared` + `server/`), and the mobile app is built with Expo. Everything is implemented by hand; this plan is structured as a **granular numbered work plan** where each item is one guided working session (walked through with Opus), with its own definition of done.

`notes/react-native-plan.md` remains valid for the client-side portability analysis and the mobile phases (3–7 below reference it); its §2 backend section is superseded by this plan. From `notes/capacitor-plan.md` (otherwise retired) three designs carry over: the system-browser OAuth → deep-link one-time-code handoff, the local-notification schedule builder (60-cap, stable ids), and the store-shipping checklists.

Decisions locked in (2026-11-12): **Spring Boot** (Java 21, Maven); **Java owns ALL auth** (NextAuth deleted); **JPA for CRUD + JdbcTemplate for the sync/bulk hot paths**; **monorepo** with `client/{web,mobile,shared}` + `server/`; **OpenAPI 3 + Swagger UI (springdoc) first-class**; production-ready throughout — no educational shortcuts.

---

## Target layout

```
Lifeplan/
├── .github/                     # CI (must live at repo root; steps run in client/)
├── client/                      # pnpm workspace root — ALL JS/TS tooling lives here
│   ├── pnpm-workspace.yaml      # packages: ["*"]
│   ├── package.json             # workspace root scripts (dev/build/lint/type-check/test)
│   ├── tsconfig.base.json
│   ├── .npmrc                   # node-linker=hoisted
│   ├── pnpm-lock.yaml
│   ├── web/                     # the ENTIRE current Next app moved verbatim (keeps "@/*": ["./*"])
│   ├── mobile/                  # Expo app (expo-router), created in Phase 3
│   └── shared/                  # ONE package "@circadium/shared", TS source, deep subpath exports ("./*")
│       └── src/
│           ├── contracts/       # 5 enums re-declared + ~25 model types (no Prisma import) + Zod schemas + wire types (BootstrapPayload, SyncRequest/Response, DatabaseChanges)
│           ├── domain/          # planRecurrence, recurringPeriods, allowedTimes, taskSplitting, precedence/, queue-/goal-handlers, plannerCompletion, habits, datetime…
│           ├── engine/          # utils/calendar-generation minus worker construction (injectable spawnWorker seam)
│           ├── calendar-core/   # pure apply* from calendarEventHandlers, eventTier, WSM pure logic, expandTemplateOccurrences()
│           ├── state/           # Redux slices + thunks + makeStore() factory
│           ├── sync/            # compareData + sync loop parameterized on an injected SyncTransport + the reconnecting WS client
│           └── draft/           # utils/draft incl. assistantEngine (injectable Anthropic client factory)
└── server/                      # Spring Boot, Maven, Java 21 — plain folder, built/run independently
    └── src/main/java/app/circadium/
        ├── config/              # SecurityConfig, CorsConfig, JacksonConfig, WebSocketConfig, OpenApiConfig
        ├── auth/                # login/register/2FA/OAuth/refresh controllers + token service + filters + rate limiting
        ├── sync/                # the OCC transaction + 14 table handlers (JdbcTemplate)
        ├── calendar/            # bootstrap + direct-action endpoints per domain (categories, locations, habits, …)
        ├── ws/                  # WebSocket handler + per-user session registry + dataVersion publisher
        ├── jobs/                # push scheduler, external-calendar refresh, token cleanup (@Scheduled + ShedLock-ready)
        ├── external/            # googlecalendar/, microsoftgraph/, ics/ (ical4j), places/, mail/ (Resend REST)
        └── admin/               # feedback inspector endpoints
```

## Technology choices (production-justified)

| Concern | Choice | Why it's the production answer |
|---|---|---|
| Framework | Spring Boot 3.x, Java 21 LTS, Maven | Industry standard, longest support horizon, largest hiring pool when the company grows |
| Realtime | Plain Spring WebSocket (`TextWebSocketHandler` + per-user session registry) | The protocol is one JSON ping; STOMP adds a broker abstraction with zero payoff at this message volume. Scale path documented (see Production baseline) |
| Background jobs | `@Scheduled` + **ShedLock** (Postgres-backed lock table) from day one | ShedLock makes every job safe under horizontal scaling immediately — no rework when a second instance appears. Quartz only if cron persistence/misfire handling is ever needed |
| Data access | JPA/Hibernate entities (hand-written, `ddl-auto=validate`) + JdbcTemplate for sync/bulk; **Flyway** owns migrations after Prisma cutover | ORM for the 80% CRUD, hand SQL where correctness and batching matter (the OCC transaction) |
| JWT | Spring Security `oauth2-resource-server` validating RS256 via local JWKS; tokens issued with Nimbus JOSE; keypair in secret storage, public key at `/.well-known/jwks.json`, **`kid` header + rotation support from the start** | Asymmetric signing lets Next middleware and any future service verify without sharing a secret |
| Passwords | `BCryptPasswordEncoder` | Wire-compatible with existing bcryptjs `$2a/$2b` hashes — no forced resets at migration |
| OAuth (Google/GitHub, later Apple) | Authorization-code + **PKCE + `state` + exact-redirect-URI validation**, implemented in `auth/oauth/` against the providers' token endpoints | Full control over the token model (we issue our own tokens, not Spring's session); the security checklist is explicit in item 1.8 and reviewed before production |
| ICS parsing | ical4j | Mature recurrence expansion (overrides, EXDATEs) — port of `parseIcsFeed` |
| Email | Resend REST API via `java.net.http.HttpClient` | Already the product's provider; no SDK needed |
| Google Places/Routes, Google/Microsoft token refresh | plain REST via `HttpClient`, porting `lib/google-maps-api.ts` + `externalSourceServer.ts` (Microsoft's rotating refresh tokens persisted on every fetch) | Same API surface as today |
| Push | Expo Push API (HTTPS POST + receipt checking) | Works with EAS builds; raw FCM/APNs unnecessary |
| API docs | **springdoc-openapi**: OpenAPI 3 at `/v3/api-docs`, Swagger UI at `/swagger-ui.html` (ADMIN-gated in prod) | Living contract documentation; CI exports the spec and `openapi-typescript` type-checks it against the hand-written TS contracts — automatic drift detection |
| Testing | JUnit 5 + **Testcontainers** (Postgres) + the golden contract corpus | Integration tests run against real Postgres in CI, not H2 |
| Observability | Actuator + Micrometer; **Sentry** in both Java and Next; structured JSON logs with request-correlation ids | Non-negotiable for a product with paying users |

## Production baseline (cross-cutting, applies to every phase)

- **Environments**: local (Docker Postgres) → **staging** (separate Neon branch + server instance + Vercel preview env) → prod. Nothing ships to prod without passing staging. Config via environment only; secrets in the host's secret manager, never in the repo.
- **Security**: rate limiting (Bucket4j, Postgres/Caffeine-backed) on all auth endpoints; account lockout with exponential backoff; audit log table for auth events (login, failed login, refresh reuse, password change, OAuth link); strict CORS allowlist; security headers (HSTS, nosniff, frame-deny); cookie attributes `httpOnly; Secure; SameSite`; Dependabot + `mvn dependency-check` in CI; the OWASP ASVS L1 checklist run against the auth surface before the web flip (item 1.10).
- **Reliability**: Actuator liveness/readiness probes wired to the host; graceful shutdown (in-flight syncs complete); HikariCP pool sized against Neon's connection limits (PgBouncer-pooled URL for the app, direct URL for Flyway); Neon PITR backups verified by an actual test restore once.
- **Scaling honesty**: v1 runs single-instance (fine for current load). The two per-instance components are built behind interfaces with a documented scale path: WS registry → Redis pub/sub fan-out; scheduled jobs → already ShedLock-safe. No other server state is in-memory.
- **Error handling**: global `@RestControllerAdvice` → RFC 7807 `ProblemDetail` responses; Bean Validation (`@Valid`) on every request DTO; never leak stack traces.
- **Deployment**: `server/Dockerfile` (multi-stage Maven → JRE 21); host must support WebSockets and zero-downtime deploys (Railway/Fly.io to start; Azure/AWS later if desired). Web stays on Vercel (Root Directory `client/web`). CI (GitHub Actions): `pnpm -r type-check && pnpm -r test` + `mvn verify` (Testcontainers) + OpenAPI-vs-contracts drift check on every PR.
- **Schema authority rule** (never two migration systems on one DB): during coexistence Prisma owns migrations — **new tables Java needs (sessions, device_push_tokens, sent_notifications, audit_log, shedlock) are added via Prisma migrations**; Java validates with `ddl-auto=validate`. At cutover (end of Phase 2) Prisma is deleted and Flyway baselines.

---

## Granular work plan

Each item ≈ one guided working session. Definition of done (DoD) listed per item; the Phase-0 gate command is `pnpm -r type-check && pnpm -r test && pnpm --filter web build`.

**Progress:** Phase 0 ☑1/9 · Phase 1 ☐0/14 · Phase 2 ☐0/6 · Phases 3–7 ☐0/5 — _update the counts as boxes get ticked._

### Phase 0 — Monorepo extraction (web behavior unchanged)

- [x] **0.1 Workspace re-shape**: pnpm workspace rooted in `client/` (`client/pnpm-workspace.yaml` → `["*"]`, `client/package.json`, `client/tsconfig.base.json`, `client/.npmrc` → `node-linker=hoisted`) so the repo root is just `client/` + `server/` + VCS/docs (no JS tooling near the Java server); move the Next app → `client/web`; CI `.github/` stays at root but runs in `client/`; Vercel Root Directory → `client/web`. *DoD: gate green; prod deploy from `client/web`; manual smoke of calendar drag/resize/sync.* **DEFERRED until this branch merges to `main`:** Vercel Root Directory → `client/web`, prod deploy, and the manual calendar smoke test (local gate already green; these touch prod, so hold them for merge time).
- [ ] **0.2 `client/shared` skeleton**: package.json (`"name": "@circadium/shared"`, exports `"./*": "./src/*.ts"`), tsconfig, minimal jest config, `transpilePackages` in next.config. *DoD: a dummy export imports from web and a shared test runs via `pnpm -r test`.*
- [ ] **0.3 contracts/**: re-declare the 5 Prisma enums (const-object + literal-union) and ~25 model types carrying the existing runtime augmentations; wire types (`BootstrapPayload`, `SyncRequest/Response`, `DatabaseChanges`); Zod schemas; **type-level conformance asserts in `client/web`** (`Expect<Equal<contracts.Planner, Prisma.PlannerGetPayload<undefined>>>`). *DoD: gate green; renaming a Prisma enum member temporarily fails `type-check`.*
- [ ] **0.4 domain/ extraction**: move `planRecurrence`, `recurringPeriods`, `allowedTimes`, `taskSplitting`, `precedence/`, `queue-handlers/`, `goal-handlers/`, `goalPageHandlers`, `plannerCompletion`, `habits/`, `datetime/` etc.; re-export shims at old paths; move their tests. *DoD: gate green, zero source-edit diffs in importing files.*
- [ ] **0.5 engine/ extraction**: `utils/calendar-generation` minus worker construction; `engineClient.ts` keeps protocol + inline fallback with injectable `spawnWorker`; `client/web/lib/engineWorker.ts` keeps the `new Worker(new URL(...))` construct and calls `configureEngineClient` at bootstrap. *DoD: gate green; engine regression suite passes from its new home; web regen verified in browser.*
- [ ] **0.6 calendar-core/ extraction**: pure `apply*` from `calendarEventHandlers`, `eventTier`, WSM pure logic (`eventSerializers`, `timeWindow`, `useWeekStructureState`'s pure parts), new `expandTemplateOccurrences()`. FC-typed adapters stay in web. *DoD: gate green.*
- [ ] **0.7 state/ extraction**: slices + thunks + `makeStore()` factory; web's `StoreProvider` consumes the factory. *DoD: gate green; full app smoke.*
- [ ] **0.8 sync/ extraction**: `compareCalendarData` + the sync loop parameterized on an injected `SyncTransport`; web transport = a 5-line adapter around the existing server actions (swapped for the Java fetch in 1.13). *DoD: gate green; OCC stale-recovery manually provoked and verified.*
- [ ] **0.9 draft/ extraction**: `utils/draft` incl. `assistantEngine` with injectable Anthropic client factory. *DoD: gate green; assistant turn streams in web.*

### Phase 1 — Spring core: foundation, auth, sync, realtime

- [ ] **1.1 Project scaffold**: Spring Initializr (web, security, data-jpa, validation, actuator, websocket, postgres, flyway [present, inactive during coexistence], springdoc, testcontainers); package layout per the target tree; profiles `local/staging/prod`; all config via env. *DoD: `mvn verify` green in CI; `/actuator/health` up locally against docker Postgres.*
- [ ] **1.2 Local + CI infra**: server service in `docker-compose.dev.yml`; GitHub Actions job running `mvn verify` with Testcontainers; Dockerfile (multi-stage); deploy the empty app to the chosen host's **staging** env. *DoD: staging URL serves `/actuator/health`; CI red/green demonstrably works.*
- [ ] **1.3 JPA entity layer**: hand-written entities mirroring every Prisma model, `ddl-auto=validate` against the real schema; enum mappings for the Postgres enums; repository smoke tests on Testcontainers (schema loaded from `prisma migrate diff` SQL dump). *DoD: context boots with validate against dev Neon AND the Testcontainers schema; one round-trip test per aggregate.*
- [ ] **1.4 Error/observability baseline**: `@RestControllerAdvice` → ProblemDetail; Bean Validation wiring; correlation-id filter + structured JSON logging; Micrometer + Actuator metrics; Sentry SDK. *DoD: a thrown exception produces a 7807 body, a Sentry event, and a correlated log line.*
- [ ] **1.5 Token service**: `sessions` table (id, userId, tokenHash, expiresAt, lastUsedAt, deviceName, replacedBy) **added via a Prisma migration**; RS256 keypair management with `kid` + rotation support; JWKS endpoint; access-JWT issue/verify (15 min, `aud: circadium-api`); opaque refresh tokens, hashed, rotated, with **reuse-detection → chain revocation**; `/auth/refresh`, `/auth/logout`. *DoD: unit + integration tests incl. the reuse-detection path; resource-server validation rejects expired/bad-audience tokens on a probe endpoint.*
- [ ] **1.6 Credentials auth**: `/auth/register`, `/auth/login` (bcrypt back-compat; `requires2fa` step-up porting TwoFactorToken/Confirmation semantics), `/auth/2fa`; Bucket4j rate limits + lockout with backoff; audit-log writes. *DoD: a pre-migration account logs in; brute-force test hits the limiter; audit rows appear.*
- [ ] **1.7 Mail + account flows**: Resend adapter; password reset, email verification, account-deletion confirmation — porting the existing token tables' semantics. *DoD: each flow end-to-end on staging with a real mailbox.*
- [ ] **1.8 OAuth**: Google + GitHub authorization-code with PKCE, `state`, exact redirect URIs; `Account`-table linking (existing rows keep working); web completion sets cookies; mobile completion mints a one-time 60s handoff code → `POST /auth/handoff`. Security checklist reviewed item-by-item (state entropy, code single-use, no token leakage in logs/referrers). *DoD: both providers round-trip on staging; an existing OAuth user's account links, not duplicates.*
- [ ] **1.9 Web cookie model**: Java sets `httpOnly; Secure` cookies on the apex (`Domain=.circadium.app`; API at `api.circadium.app`); refresh cookie path-scoped to `/auth/refresh`; CORS with credentials for the web origin. Local dev works because localhost cookies ignore ports. *DoD: login from the staging web origin sets cookies usable on a protected API call; CORS blocks a foreign origin.*
- [ ] **1.10 Web auth flip**: auth client in `client/web`; login/register/reset pages post to Java; `requireUser()` shim — `auth()`'s internals become "verify the Java JWT cookie against the JWKS" (`jose`, edge-safe, so `middleware.ts` gating is unchanged in shape); **all un-migrated server actions keep working through the shim**. OWASP ASVS L1 pass over the whole auth surface. Bake on staging, then prod; **delete NextAuth** (config, adapter, api/auth routes) after a clean week. *DoD: production login/2FA/OAuth/reset all on Java; NextAuth gone; a request with no/expired token is rejected on every protected route.*
- [ ] **1.11 Bootstrap endpoint**: `GET /calendar/bootstrap` returning the `fetchCalendarData` payload + locations + travelTimes, matching the TS contracts byte-for-byte (golden fixture). *DoD: fixture test green; springdoc shows the documented schema.*
- [ ] **1.12 Sync endpoint**: `POST /calendar/sync` in one `@Transactional` JdbcTemplate service — OCC gate (`UPDATE users SET data_version = data_version + 1 WHERE id=? AND data_version=?`; 0 rows → rollback → `409 {reason:"stale", freshState}`), the 14 handlers in FK-safe order porting `sync-handlers/` (bulk `UPDATE … FROM (VALUES …)` with ghost-id-safe WHERE joins; `INSERT … ON CONFLICT` for ExtendedProps; wholesale delete+create for the engine-derived tables), empty-diff short-circuit without version bump. **Golden contract corpus**: instrument the TS `syncCalendarData` temporarily to record real `DatabaseChanges` + before/after DB states; replay against Java on Testcontainers; row-level diff. *DoD: corpus green in CI; load test: a first-regen-after-load-sized payload (hundreds of writes) completes well inside timeout.*
- [ ] **1.13 Web sync transport switch**: swap the 0.8 transport for the Java fetch behind an env flag; staging bake → prod. *DoD: web in production on Java sync; forced-stale via a second session recovers via `adoptFreshServerState`; the old action path deleted after bake.*
- [ ] **1.14 WebSocket hub + client**: `/ws` authenticated at handshake (access JWT); per-user session registry **behind an interface** (single-instance impl now, Redis pub/sub impl slot documented); every successful sync publishes `{type:"dataVersion", value}` to the user's other sessions; a behind client runs the existing stale-adoption path. Client: reconnecting-WS module in `client/shared/src/sync/` (backoff, version re-check on reconnect), wired into web. *DoD: two browsers — an edit in one appears in the other without user action, verified on prod.*

### Phase 2 — Full action migration + push; Prisma retired

Per group: implement Java endpoints → **parity test** (same request via server action and Java route → identical DB effect + response) → switch web → bake → delete the server actions.

- [ ] **2.1 Group A**: occurrenceCompletions, viewState, scheduling settings/preferences. *(Low risk, proves the per-group loop.)*
- [ ] **2.2 Group B**: categories, locations (Places/Routes via `HttpClient`, the transactional `TravelApiBudget` reservation, travel top-up job → `@Scheduled`+ShedLock), habits.
- [ ] **2.3 Group C**: externalCalendars (ical4j parse with recurrence/overrides/EXDATEs; Google + Microsoft connect/callback routes move to Java; Microsoft rotating refresh tokens persisted every fetch; refresh windows per `refreshPolicy`), draftConversations.
- [ ] **2.4 Group D**: feedback + suggestion wall, data export/import (GDPR export byte-compares with the TS export modulo timestamps), onboarding completion, admin surface, account deletion.
- [ ] **2.5 Server push**: `device_push_tokens` + `sent_notifications` tables (Prisma migration); `POST /devices/register`; ShedLock'd scheduler scanning upcoming synced engine-output events → Expo Push API with **receipt checking + invalid-token pruning**. *DoD: a push reaches a closed test app; duplicate-send impossible by dedup-table design.*
- [ ] **2.6 Prisma cutover**: delete `prisma/`, generated client, driver adapter, conformance asserts; `flyway baseline` on the current schema — Flyway owns migrations from now; port the seed to Java. *DoD: `client/web` has zero server actions and zero Prisma; a fresh `flyway migrate` + seed stands up a working local environment.*

### Phases 3–7 — Mobile (per `notes/react-native-plan.md`, with deltas)

- [ ] **3** Expo shell + **calendar-kit spike gate first** (the RN plan's 9-point spike) + auth screens (credentials vs Java; OAuth via system browser + handoff code) + five event streams read-only + local notifications tier.
- [ ] **4** Interactions: tap sheets, drag/resize/create, the `pendingEdit` controlled overlay, scope sheets, inline regen + sync + WS adoption on device.
- [ ] **5** Template editing (WSM-equivalent screen) + settings/view-state surfaces.
- [ ] **6** AI assistant: BYOK on `expo-secure-store`, `expo/fetch` streaming injected into the client factory, draft UI port.
- [ ] **7** Ship: store paths from capacitor-plan Phases 4/5 — **start Apple enrollment and the Play closed-test track on day 1 of Phase 3** (they're calendar-time long poles) — then post-v1 (worklet engine offload, offline queueing, diff-over-socket).

Deltas vs the RN plan: SignalR client → the shared reconnecting-WS module; auth screens → Spring endpoints; push registration → `POST /devices/register`.

---

## Working through the plan

Each numbered item is one session. Prompt pattern: open the repo, reference this file + the item number, and ask for a step-by-step walkthrough of that item only. The DoD is the session's exit test — don't start the next item until it's met and (for Phase 1+) deployed to staging.

## Risks (ranked)

1. **The sync-transaction port** — the most invariant-dense code in the system (OCC gate, FK order, bulk updates, empty-diff rule). Mitigation: golden corpus + web as first production consumer long before mobile exists.
2. **The web auth flip** (1.10) — the largest single production change. Mitigation: shim keeps all server actions alive; full staging bake; ASVS checklist; NextAuth deleted only after a clean production week.
3. Dual-stack drift during Phase 2. Mitigation: strangler per group, parity test before every delete, Prisma sole migration authority until 2.6.
4. JPA ↔ schema drift during coexistence. Mitigation: `ddl-auto=validate` at startup + golden fixtures + the OpenAPI/contracts CI drift check.
5. calendar-kit spike risks (unchanged from the RN plan: `pendingEdit` overlay, top-edge resize).
6. Metro + pnpm workspace linking (`node-linker=hoisted`).
7. Solo bandwidth: Phases 1–2 are each XL. Mitigation: the strangler order lands value incrementally — production WS sync benefits web users long before mobile exists.

## Verification

- **Phase 0**: the gate command per item; prod deploy + manual calendar smoke after 0.1; conformance asserts proven by a deliberate enum rename.
- **Phase 1**: golden corpus green in CI (Testcontainers); e2e login → bootstrap → mutate → sync → forced stale → adoption; two-browser instant adoption on prod; bcrypt back-compat; refresh-reuse revokes the chain; rate limiter and lockout demonstrably trigger; ASVS L1 checklist archived.
- **Phase 2**: per-group parity tests; push reaches a closed app with no duplicates; GDPR export parity; fresh-environment stand-up from Flyway + Java seed.
- **Phases 3–7**: the RN plan's verification section (device-vs-web parity per interaction, identical engine output ids, BYOK round-trip, store-track installs).
