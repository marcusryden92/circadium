# Circadium Server — Spring Boot API

The dedicated backend for Circadium. It replaces the Next.js server-action + Prisma
backend so the product can have WebSocket-driven multi-session sync, app-closed push
notifications, and a real mobile client. This is a plain Maven project built and run
independently of the `client/` pnpm workspace — the two halves share no tooling.

The migration plan is [`_notes/java-backend-steps/0.0a.java-backend-plan.md`](../_notes/java-backend-steps/0.0a.java-backend-plan.md),
with one step file per numbered item beside it. Work proceeds one item per session; read
the item's step file before starting it.

## Stack

- Spring Boot 4.1.2, Java 25 LTS (Temurin), Maven via the wrapper (`mvnw` / `mvnw.cmd`).
- Boot 4 starter names differ from Boot 3: `spring-boot-starter-webmvc` (not `-web`),
  Flyway via `spring-boot-starter-flyway` + `flyway-database-postgresql`, and modular
  `spring-boot-starter-*-test` starters instead of one `spring-boot-starter-test`.
- Data: JPA/Hibernate for CRUD, JdbcTemplate for the sync/bulk hot paths. Flyway is on
  the classpath but inactive during coexistence (`spring.flyway.enabled=false`,
  `jpa.hibernate.ddl-auto=validate`) — Prisma owns migrations until the Phase 2 cutover.
- API docs: springdoc-openapi 3.x (`/v3/api-docs`, `/swagger-ui.html`). Its version is
  pinned explicitly in the POM because the Spring Boot BOM does not manage it.

## Build and run

Run everything from `server/` (PowerShell is the default shell here):

```powershell
.\mvnw.cmd verify          # full build + tests; needs Docker Desktop running (Testcontainers)
.\mvnw.cmd spring-boot:run # boot locally against the docker Postgres
```

Tests use Testcontainers with the Postgres image pinned to `postgres:16` and the
`@ServiceConnection` pattern, which auto-wires the datasource from a throwaway container
— so `verify`/`test` require Docker Desktop to be running. `compile` does not.

CI also runs an OWASP CVE gate on every server-touching push (`-Psecurity dependency-check:check`,
fails on CVSS >= 7; needs the `NVD_API_KEY` repo secret). Fuzzy-CPE false positives are suppressed
with per-entry justifications in `dependency-check-suppressions.xml`.

Deploys run from `.github/workflows/server-ci.yml` after `verify`, on pushes that touch
`server/`:

| Branch | Fly app | Host | Config | GitHub secret |
|---|---|---|---|---|
| `feature/server` | `circadium-server-staging` | `api.staging.circadium.app` | `fly.toml` | `FLY_API_TOKEN_STAGING` |
| `main` | `circadium-server` | `api.circadium.app` | `fly.prod.toml` | `FLY_API_TOKEN_PROD` |

Each secret is a deploy token for its own app only. Both apps run one always-on machine in
`fra` and deploy blue-green: a release that fails its health check never takes over. If the
schema check fails because the web's Vercel build had not yet applied a new Prisma
migration, re-run the job once the Vercel deploy is done. The failed release leaves its new
machine behind, and the next deploy refuses while two images are present: destroy that machine
first (`fly machine destroy <id> --force`). Do not restart it, because once healthy it takes
traffic beside the old machine, and the sign-in session and rate limiter are per machine. A
manual deploy from `server/` is `fly deploy --remote-only` (staging) or
`fly deploy --remote-only -c fly.prod.toml` (prod); `--image <the job's registry.fly.io image>`
in place of `--remote-only` reuses the image the job built. If Fly's Depot builder never starts
(`Waiting for depot builder... deadline_exceeded`), add `--depot=false`.

## Configuration and database

Config is environment-only across three profiles in `application.yml` (`local` is the
default; `staging`, `prod`). Secrets never live in the repo.

- The Java datasource is a JDBC URL via `DATABASE_JDBC_URL` (plus `DATABASE_USERNAME`
  / `DATABASE_PASSWORD`) — deliberately distinct from the web app's libpq/Prisma
  `DATABASE_URL`.
- Locally these fall back to the docker Postgres the web app brings up with
  `pnpm db:start` (from `client/web`): `jdbc:postgresql://localhost:5433/circadium_dev`,
  user/password `circadium`/`circadium`.
- `staging`/`prod` supply the datasource vars with no defaults. Both connect through Neon's
  pooled host (PgBouncer, transaction pooling), so nothing may change session state: no
  `@Transactional(isolation = ...)` (PgJDBC applies it with `SET SESSION CHARACTERISTICS`,
  outside the transaction). Set isolation with `SET TRANSACTION ISOLATION LEVEL ...` as the
  transaction's first statement, as `calendar/CalendarBootstrapService` does. For the same
  reason the Hikari pool sets no connection-init session state; its ceiling is
  `DATABASE_POOL_SIZE` (default 10), a deliberate bound against Neon's connection budget.
- **Graceful shutdown** is on (`server.shutdown: graceful`, drain `75s`), above the 60s sync
  timeout, and Fly's `kill_timeout = "90s"` sits above the drain — so a blue-green deploy's
  SIGTERM lets an in-flight sync commit instead of being cut off.

## Calendar data

`GET /calendar/bootstrap` (`calendar/`) returns the whole calendar state; `POST /calendar/sync`
(`sync/`) applies the client's create/update/destroy diff. Both speak the records in
`calendar/CalendarContracts`, which mirror `client/shared/src/contracts` field for field.
Jackson 3 refuses a `null` or missing value for a primitive, so a field the TS marks optional
must be boxed there (the extended props' trespass flags are).

- **Optimistic concurrency.** The account's `users.dataVersion` is the sync token. A sync bumps
  it first (`WHERE dataVersion = clientKnownDataVersion`), then writes, in one transaction
  (60-second timeout). Zero rows bumped means another session saved first: 409 ProblemDetail,
  `code: "stale"`, with `freshState` (the bootstrap payload, read in a transaction of its own
  after the rollback). An empty diff answers 200 without bumping.
- **Writes** go through `sync/BulkStatements`: one statement per table and operation, rows passed
  as one array per column through `unnest`, so the parameter count is fixed whatever the batch
  size. Every write is scoped to the caller; an id that is missing or someone else's matches
  nothing rather than failing. References read back through a parent (a window's category, a
  member's queue) or holding a table-wide unique slot (a member's planner, a dependency's ends)
  must point at the caller's own rows, or the row is skipped. `sync/CalendarChangeWriter` holds
  the per-table column lists in foreign-key order.
- **Compression.** Both payloads carry the whole calendar, so `server.compression` gzips JSON and
  `application/problem+json` (the stale 409) over 2 KB. Tomcat does it, so MockMvc cannot see it:
  `web/ResponseCompressionIntegrationTest` checks it over a real port.
- **Golden corpus.** `src/test/resources/sync/corpus/*.json` are diffs applied to
  `calendar/bootstrap-seed.sql`, with the response and every row afterwards (`sync/dump-state.sql`).
  They were captured from the web's own sync before it was retired (plan 1.13) and are now frozen
  Java test resources. `SyncCorpusIntegrationTest` replays them with the clock frozen at the
  capture's instant; a Java change to the sync must keep the corpus green. Regenerating it after a
  seed or diff change is now done Java-side. The stale case's recorded `freshState` is a full
  bootstrap payload, so a `BootstrapPayload` field addition must be reflected in `11-stale.json`
  and `bootstrap-expected.json` by hand (both compare NON_EXTENSIBLE).

### Direct-action endpoints (plan 2.1 Group A)

Per-domain writes that deliberately live OUTSIDE the sync diff — none of them ever moves
`users.dataVersion` (asserted in their integration tests). All follow the retired Prisma server
actions' semantics exactly; the parity evidence is the integration tests pinning column-level DB
effects and response shapes.

- `GET/PUT/DELETE /calendar/occurrence-completions` (`calendar/OccurrenceCompletionController`) —
  the occurrence-completion log, one row per (plannerId, occurrenceKey). PUT upserts (update
  branch moves only start/end, keeping id + createdAt), 404 `item_not_found` unless the planner is
  the caller's; DELETE takes query params and is a no-op for a missing row. `HabitCompletions.createdAt`
  is `timestamp(3)` since this step (the last 1.13b straggler); `start`/`end` stay TEXT until the
  2.5 domain-datetime decision.
- `GET/PUT /view-state` (`calendar/ViewStateController`) — the graph/mindmap canvas blobs, one row
  per user; PUT patches only the named canvas's column (`kind: graph|mindmap`), stamping
  `updatedAt` itself (that table has no DB trigger).
- `PATCH /scheduling/preferences` (`calendar/SchedulingPreferencesController`) — partial update of
  `bufferTimeMinutes`/`weekStartDay`/`defaultTransportMode` (at least one required; weekday 0-6);
  the first write creates the row with column defaults for the rest. Reads ride the bootstrap:
  `BootstrapPayload` carries `schedulingPreferences`, answering `{5, DRIVING, 1}` for an account
  with no row — deliberately not the column default 10, preserving the retired action's fallback
  (normalizing the two is post-cutover debt).

### Locations, travel times and habits (plan 2.2 Group B)

The Google-dependent location surface and the habit trackers (same out-of-band rules as Group A).
Google clients live in `external/maps` (`PlacesClient`/`RoutesClient` interfaces, REST impls over
`RestClient` with retry on 429/5xx and the exact TS field masks); `GOOGLE_MAPS_API_KEY` is one key
for both APIs and optional in every profile — absent, these endpoints answer 503
`maps_not_configured`, so a deploy never waits on the secret. Tests replace both clients with
fakes in `TestcontainersConfiguration`.

- `POST /locations/search` — Places autocomplete behind a per-user 30/min in-memory throttle
  (429 `search_throttled`; single-instance like the auth rate limiter).
- `POST /locations`, `PATCH /locations/{id}` (`calendar/LocationController`) — create resolves the
  place server-side (cap 5 → 409 `location_limit`; duplicate placeId → 409 `duplicate_place`); a
  place change refetches details and drops every cached travel time touching the location. Name
  edits, deletes and custom overrides ride the sync diff, not these endpoints.
- `POST /travel-times/fetch-missing`, `POST /travel-times/refresh-all`
  (`calendar/TravelTimeController`) — the Routes `computeRouteMatrix` flows. Freshness policy in
  `calendar/TravelRefreshPolicy` (ported thresholds: 180d TTL, 30d unroutable retry, 1h refresh
  gates, 10-pair top-up cap, monthly element cap 4500); every spend reserves first through
  `calendar/TravelApiBudgetService` — a `FOR UPDATE` on the account-global `TravelApiBudget` row,
  committed before the Google call (the TS version could double-spend under concurrency). Refusals
  answer 409 (`travel_budget` / `refresh_gate`) with the TS wording; both responses carry the
  account's fresh rows so the client needs no follow-up read. Writes preserve custom overrides and
  negative-cache unroutable pairs.
- `GET/POST /habits`, `POST/PATCH/DELETE /habits/buckets[/{id}]`, `DELETE /habits/{id}`,
  `PUT/DELETE /habits/{habitId}/items`, `POST /habits/apply` (`calendar/HabitController`) — the
  tracking layer. Links accept only top-level repeating rows (the TS recurrence-parse rule, 409
  `item_not_repeating`); the assistant batch runs in one transaction with skip-unknown semantics
  and caller-supplied bucket/habit ids; its update wire uses `PatchField {set, value}` because the
  per-field delta distinguishes absent from null.

## Scheduled jobs (`jobs/`)

`@Scheduled` + ShedLock from day one (`jobs/SchedulingConfig`: Postgres `shedlock` table,
`usingDbTime`), so every job is already safe when a second instance appears. First job:
`TravelTopUpJob` (nightly 03:40 UTC) — the silent travel-time top-up the client used to trigger
once per app load. Per user with ≥2 locations: the 24h `lastTravelTopUpAt` allowance, oldest
stale pairs capped at 10, quiet stop on a spent budget. Clients see fresh rows on the next
bootstrap.

## Realtime (`ws/`)

`/ws` is a raw WebSocket (`config/WebSocketConfig`) that pushes one message, server to client:
`{"type":"dataVersion","value":N}`. A connect gets a hello carrying the account's current version
(so a reconnecting client re-checks for free), and every committed sync broadcasts the new version
to all of the user's sessions. A client that hears a version past the one it knows fetches the
bootstrap and adopts it — the stale-sync recovery, without having had to try a sync first.

- **Auth is the handshake.** `/ws` is not public, so the API chain authenticates the upgrade GET
  (bearer header for mobile, access cookie for web) before it reaches the handler;
  `ws/AuthenticatedUserHandshakeInterceptor` copies the user id onto the session. Spring's own
  `setAllowedOrigins` is set to the CORS origins — the handshake is cross-origin (web to API), and
  this is the cross-site WebSocket hijacking defence.
- **Liveness.** The one inbound frame is the client's keepalive ping, answered with
  `{"type":"pong"}` (through the concurrency decorator) so the client can tell a live socket from
  a half-open one and reconnect (no frame for a full ping interval -> reconnect, client side). The
  registry drops a session whose send throws, and a transport error closes it, so a dead socket
  does not leak.
- **The registry is local; the broadcaster is the scale seam.** `ws/WebSocketSessionRegistry` holds
  this instance's sockets (each wrapped in a `ConcurrentWebSocketSessionDecorator` so sends never
  race). `ws/DataVersionBroadcaster` is the interface a multi-instance deployment reimplements over
  Redis pub/sub; `LocalDataVersionBroadcaster` delivers straight to the registry for now.
  `sync/CalendarSyncService` calls it after the commit, never inside the transaction.
- `ws/CalendarRealtimeIntegrationTest` drives it over a real port: two sessions of one user both get
  the hello and the post-sync broadcast, and a tokenless handshake is refused.

## Security (current state)

`config/SecurityConfig` has two filter chains. The API chain is a stateless token
resource server: every request needs a valid RS256 access JWT except the endpoints in
`SecurityConfig.PUBLIC_ENDPOINTS` (`/actuator/health/**`, `/actuator/info`,
`GET /.well-known/jwks.json`, `POST /auth/{register,login,2fa,refresh,logout,verify-email,handoff,oauth/confirm}`,
`POST /auth/password-reset[/confirm]`, `/error`). New public endpoints go in that one list.
Swagger/OpenAPI is open under the `local` profile and elsewhere requires `ROLE_ADMIN`
**and** a 2FA-verified session (`amr` contains `mfa`, an `AuthorizationManager` in
`SecurityConfig`), matching the web's other admin tools so a password-only admin token can't
read the schema. The JWT's `role` claim maps to `ROLE_USER` / `ROLE_ADMIN`. The security
chain's 401 and 403 answer with the same RFC 7807 ProblemDetail body as the rest of the API
(`web/ProblemDetailAuthenticationEntryPoint` / `ProblemDetailAccessDeniedHandler`, wrapping
Spring's bearer entry point so `WWW-Authenticate` survives); a CORS reject carries one too
(`web/ProblemDetailCorsProcessor`). These run in the filter chain, before the
DispatcherServlet, so `GlobalExceptionHandler` never sees them. Besides signature, `iss`, `aud` and `exp`,
the decoder requires the token's `sid` family to still have a `sessions` row
(`auth/SessionFamilyValidator`), so sign-out, reuse detection and a password change or reset
end access tokens at once, not after 15 minutes. A sign-in that passed the emailed 2FA code
carries `amr: ["pwd","otp","mfa"]` (stored as `sessions.twoFactorVerified`, copied on
rotation); the web's admin tools require it. API responses carry
`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (not Swagger UI).
Actuator exposes only `health` and `info` over HTTP.

Two clients, two token transports (`auth/ClientType`):

- **Mobile** sends `Authorization: Bearer` and gets tokens in JSON bodies; refresh/logout
  take the refresh token in the body.
- **Web** gets tokens as HttpOnly cookies from `auth/AuthCookies` and never sees them in a
  body (only the expiry times). Login/2FA opt in with `"client":"web"` (default `mobile`); a
  handoff code remembers which client started the provider sign-in; refresh/logout with no
  body read the refresh cookie. Access cookie: `Domain=${AUTH_COOKIE_DOMAIN}`, `Path=/`,
  SameSite=Lax, so the web server receives it too. Refresh cookie: host-only, `Path=/`,
  SameSite=Strict. Names and domain are `circadium.auth.cookies` (`AuthCookieProperties`);
  `AUTH_COOKIE_DOMAIN` is required outside `local` (blank there: host-only, not Secure).
  Deployed names carry the browser prefixes (`__Secure-circadium_access`,
  `__Host-circadium_refresh`; staging `__Secure-circadium_staging_access`,
  `__Host-circadium_staging_refresh`), so no sibling subdomain can plant a same-named refresh
  cookie; `local` keeps `circadium_access` / `circadium_refresh`, since prefixes need Secure.
  A prefixed name that the browser would drop (not Secure, or `__Host-` with a Domain) fails
  startup. Staging uses its own cookie names because prod's access cookie also reaches
  staging's subdomains. The web's `AUTH_ACCESS_COOKIE` must match the access name.
- `auth/CookieBearerTokenResolver` takes the header first, then the access cookie, but never
  the cookie on a public endpoint (Spring 401s an invalid token even where none is required,
  so a stale cookie would break login and refresh).

CSRF: Spring's CSRF tokens are off. `config/CorsConfig` is a servlet filter (after the
correlation id, before the rate limiter and Spring Security) that allows credentialed calls
from `circadium.cors.allowed-origins` (default `WEB_BASE_URL`) and refuses, with 403, any
request carrying another `Origin`, so cross-site and sibling-subdomain pages cannot use a
browser's cookies. GET endpoints must stay free of side effects: browsers send no `Origin`
on plain GETs.

The OAuth chain (ordered first) matches only `/oauth2/authorization/**` and
`/login/oauth2/code/**`: sign-in with Google, Microsoft and Apple (`auth/oauth`, one
`SignInProvider` per provider), run by Spring Security's OAuth 2.0 client. PKCE is on for
Google and Microsoft and off for Apple, which documents no PKCE parameters (Spring 7's default
is on). It is the only place a session exists (cookie `circadium_oauth`, 10 minutes, SameSite=None
outside `local` because Apple returns with a cross-site form POST, which browsers never send Lax
cookies on), holding state/PKCE/nonce plus the caller's `client` + `challenge` for the round trip;
`OAuthLoginHandler` ends it on the callback and redirects to the configured web or mobile
completion URL with `?code=` (a 60-second one-time handoff code, stored hashed in
`oauth_handoff_codes`), `?status=verification_sent`, or `?error=`. `POST /auth/handoff` trades the
code plus the client's verifier for normal tokens. Accounts match on the NextAuth-era `accounts`
row (provider + subject; Microsoft's subject is `oid`, because its `sub` is pairwise per app
registration). An email the provider vouches for (Google's and Apple's `email_verified`) gets an
account at once; any other (every Microsoft one) gets a row in `oauth_pending_signups` and an
emailed link to `/auth/oauth/confirm`, and `POST /auth/oauth/confirm` creates the account without
signing anyone in. An email that already has an account is refused, never auto-linked (for an
unvouched email by a notice mailed to the owner, so the browser cannot probe addresses).
Provider tokens are never stored, except Apple's refresh token on its `accounts` row, which account
deletion uses to revoke the app at Apple (`AppleTokenRevoker`). Provider specifics: Microsoft uses
the `common` endpoints and `MicrosoftIssuerValidator` (the issuer must be the template with the
token's own `tid`); Apple's client secret is an ES256 JWT `AppleClientSecret` signs per request,
its callback is a POST that `CorsConfig` lets through, and the name arrives only in the first
callback's `user` form field. Settings live under `circadium.oauth`: `OAUTH_PROVIDERS` (default
`google,microsoft,apple`) lists the providers offered, and each listed one must be configured
outside `local` (startup fails otherwise; `local` switches unconfigured ones off):
`GOOGLE_CLIENT_ID`/`_SECRET`, `MICROSOFT_CLIENT_ID`/`_SECRET` (the calendar-import Entra app),
`APPLE_CLIENT_ID` (the Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the
`.p8`). The web's `NEXT_PUBLIC_OAUTH_PROVIDERS` must list the same set. Each provider must have
`${AUTH_ISSUER}/login/oauth2/code/<provider>` registered. The in-memory session is
single-instance only, like the rate limiter.

Abuse controls on the public auth endpoints, two layers:

- `auth/RateLimitFilter` — per-IP Bucket4j buckets held in memory (Caffeine), running
  before Spring Security. Correct only while the server is a single instance. Rules match
  the decoded path with `PathPatternRequestMatcher`, as Spring Security and the handlers do;
  keying on the raw request URI let `/auth/l%6Fgin` skip the login bucket.
- `auth/LoginThrottle` — per-email lockout in `auth_lockouts` (5th failure locks 1 min,
  doubling to a 1 h cap, forgotten after 24 h), keyed whether or not the account exists.

New passwords (register, reset, change) go through `auth/PasswordPolicy`: 12+ characters
counted as code points with runs of spaces collapsed, at most 72 bytes (bcrypt), no
composition rules, and not in Have I Been Pwned's range API (`external/passwords`, k-anonymity:
only 5 hex characters of the SHA-1 leave; unreachable means accepted, with a warning).
Existing shorter passwords still sign in. Tests replace the lookup with `FakeBreachedPasswords`
(in `TestcontainersConfiguration`), so no test reaches the network.

Sensitive changes by a signed-in caller re-check the current password through
`auth/CurrentPasswordCheck`, under the login lockout: password change, account deletion
request, `POST /account/email` (emails a link to the new address and a notice to the current
one; the account moves when the link is opened, and the old address is told again) and
`POST /account/two-factor` (emails the account on every change). Provider-only accounts get
`no_password` for the email and 2FA endpoints. A password change or reset also deletes the
user's pending email-change tokens.

Security events go to `audit_log` through `auth/AuditLogger`, which writes in its own
transaction (`REQUIRES_NEW`) so rows survive the failing request that produced them.
Because `audit_log` has a cascading FK to `users`, never record an event for a user row
the current transaction has locked (email change, deletion): the separate audit
transaction would wait on that lock forever. Flows that mutate the user do their writes in
a `TransactionTemplate` block and audit (and mail) after it commits.

Mail (`external/mail`, settings under `circadium.mail`): `ResendAccountMailer` when
`RESEND_API_KEY` is set, sending on a background pool with retries and an idempotency key;
otherwise `LoggingAccountMailer`, which is only allowed under `local` (it logs tokens
there) — any other profile refuses to start without a key. `WEB_BASE_URL` (the web app's
origin, used for emailed links) is required outside `local`. Tests swap in
`RecordingAccountMailer`.

Analytics erasure (`external/analytics`, settings under `circadium.analytics.posthog`): with
`POSTHOG_PERSONAL_API_KEY` (scope `person:write`) and `POSTHOG_PROJECT_ID` set, a confirmed account
deletion erases the user's PostHog person (the web identifies people by user id) and their events,
after the commit and on a background thread, retried on 429/5xx/network errors; a failure goes to
Sentry with the user id for a manual erasure. Optional in every profile: without both values startup
logs a warning and deletion skips it. Tests swap in `RecordingAnalyticsEraser`.

The uuid token tables (`VerificationToken`, `PasswordResetToken`, `AccountDeletionToken`)
store the **SHA-256 hash** of the token (`auth/TokenHashing`), like refresh tokens and handoff
codes — the raw value exists only in the emailed link, so a database read yields nothing
usable (plan 1.15). `TwoFactorToken` stays raw: a 6-digit code has too small a space for a
stored hash to protect, and online guessing is already throttled by the login lockout. Tokens
are issued for the stored email casing, since the consumer looks them up exactly. The web on
this branch no longer touches these tables; a rollback to the retired NextAuth build on `main`
would read raw — so after such a rollback, only tokens issued by the Java build in the window
before it (≤1 h-lived) would not verify, and a reissue fixes them. This was the deliberate
trade for hashing at rest.

Existing users: change their columns with the targeted updates in `UserRepository`
(`updatePassword`, `updateVerifiedEmail`), never by saving a `User` loaded earlier. Saving
rewrites every column, `dataVersion` included, and the web's sync bumps that concurrently.

Time: `timestamp(3)` columns hold UTC wall-clock. Use `persistence/DbTime` for "now"
(millisecond-truncated) and for every `JdbcTemplate` timestamp parameter or result;
Hibernate entities handle it automatically.

Token settings live under `circadium.auth` (`auth/AuthProperties`):

- `AUTH_ISSUER` — required outside `local` (defaults to `http://localhost:8080` there).
- Signing keys: `CIRCADIUM_AUTH_SIGNINGKEYS_<n>_KID` + `CIRCADIUM_AUTH_SIGNINGKEYS_<n>_PRIVATEKEY`
  (PKCS#8 PEM). Index 0 signs; all verify and are published in the JWKS. Rotate by
  inserting the new key at index 0 and dropping the old one after an access-token lifetime.
- With no keys configured, `local` generates an ephemeral key (tokens die on restart);
  every other profile refuses to start.

Refresh tokens are opaque, stored only as SHA-256 hashes in `sessions`, rotated on every
use, and grouped by `familyId`; replaying a rotated token deletes the whole family. A
sign-in lasts `refresh-token-ttl` (30 days) from the sign-in: rotation copies the family's
`expiresAt`, so use never extends it.
Rotated rows must be kept until expiry or reuse becomes undetectable. A refresh locks the
user row before its session row (`UserRepository.findByRefreshTokenHashForShare`), so anything
that ends a user's sessions must update the user row first, in the same transaction, as the
password change (`POST /account/password`) and the reset do; otherwise a refresh in flight
survives it. The password change ends every session, the caller's included, and hands the
caller a new one in the response (cookies for web, body for mobile). In tests, use
`SecurityMockMvcRequestPostProcessors.jwt()` for endpoints that only need an authenticated
caller, and real tokens from `TokenService` when the token itself is under test.

## Package layout

All packages live under `app.circadium` (component scan root). Each has a
`package-info.java` describing its responsibility:

- `config` — security, CORS, Jackson, WebSocket, and OpenAPI configuration beans.
- `auth` — credential/OAuth/2FA/refresh controllers, token service, filters, rate limiting.
- `sync` — the optimistic-concurrency sync transaction and per-table change handlers.
- `calendar` — bootstrap and per-domain direct-action endpoints.
- `ws` — WebSocket handler, per-user session registry, dataVersion publisher.
- `jobs` — scheduled jobs (push, external-calendar refresh, token cleanup), ShedLock-guarded.
- `external` — Google Calendar, Microsoft Graph, ICS, Google Places/Routes, Resend mail.
- `admin` — administrative endpoints (feedback inspector).

## Project-wide rules (inherited from the repo root)

- No emojis in code, comments, or docs.
- Comments explain *why*, not *what*; no narration or changelog comments.
- No summary / changelog / migration-notes markdown files in the repo.
- Spell out "category" (never "cat"); the location surface is "Locations" (never "Places").
