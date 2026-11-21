# Circadium Server — Spring Boot API

The dedicated backend for Circadium. It replaces the Next.js server-action + Prisma
backend so the product can have WebSocket-driven multi-session sync, app-closed push
notifications, and a real mobile client. This is a plain Maven project built and run
independently of the `client/` pnpm workspace — the two halves share no tooling.

**The authoritative plan is [`_notes/java-backend-plan.md`](../_notes/java-backend-plan.md)**
(note the leading underscore; the root CLAUDE.md's `notes/...` link is stale). Work
proceeds one numbered item per session; read the plan's item before starting it.

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

Deploys: a push to `feature/server` that touches `server/` runs `verify` in
`.github/workflows/server-ci.yml`, then `flyctl deploy --remote-only` to
`circadium-server-staging` (GitHub secret `FLY_API_TOKEN_STAGING`, a deploy token for that
app only). `fly.toml` deploys blue-green: a release that fails its health check never takes
over. If the schema check fails because the web's build had not yet applied a new Prisma
migration, re-run the job once the Vercel deploy is done.

## Configuration and database

Config is environment-only across three profiles in `application.yml` (`local` is the
default; `staging`, `prod`). Secrets never live in the repo.

- The Java datasource is a JDBC URL via `DATABASE_JDBC_URL` (plus `DATABASE_USERNAME`
  / `DATABASE_PASSWORD`) — deliberately distinct from the web app's libpq/Prisma
  `DATABASE_URL`.
- Locally these fall back to the docker Postgres the web app brings up with
  `pnpm db:start` (from `client/web`): `jdbc:postgresql://localhost:5433/circadium_dev`,
  user/password `circadium`/`circadium`.
- `staging`/`prod` supply the datasource vars with no defaults.

## Security (current state)

`config/SecurityConfig` has two filter chains. The API chain is a stateless token
resource server: every request needs a valid RS256 access JWT except the endpoints in
`SecurityConfig.PUBLIC_ENDPOINTS` (`/actuator/health/**`, `/actuator/info`,
`GET /.well-known/jwks.json`, `POST /auth/{register,login,2fa,refresh,logout,verify-email,handoff}`,
`POST /auth/password-reset[/confirm]`, `/error`). New public endpoints go in that one list.
Swagger/OpenAPI is open under the `local` profile and `ROLE_ADMIN` elsewhere. The JWT's
`role` claim maps to `ROLE_USER` / `ROLE_ADMIN`.

Two clients, two token transports (`auth/ClientType`):

- **Mobile** sends `Authorization: Bearer` and gets tokens in JSON bodies; refresh/logout
  take the refresh token in the body.
- **Web** gets tokens as HttpOnly cookies from `auth/AuthCookies` and never sees them in a
  body (only the expiry times). Login/2FA opt in with `"client":"web"` (default `mobile`); a
  handoff code remembers which client started the Google sign-in; refresh/logout with no
  body read the refresh cookie. Access cookie: `Domain=${AUTH_COOKIE_DOMAIN}`, `Path=/`,
  SameSite=Lax, so the web server receives it too. Refresh cookie: host-only, `Path=/auth`,
  SameSite=Strict. Names and domain are `circadium.auth.cookies` (`AuthCookieProperties`);
  `AUTH_COOKIE_DOMAIN` is required outside `local` (blank there: host-only, not Secure).
  Staging uses its own cookie names because prod's access cookie also reaches staging's
  subdomains.
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
`/login/oauth2/code/**`: Google sign-in (`auth/oauth`), run by Spring Security's OAuth 2.0
client with PKCE forced on. It is the only place a session exists (cookie `circadium_oauth`,
10 minutes), holding state/PKCE/nonce plus the caller's `client` + `challenge` for the round
trip to Google; `OAuthLoginHandler` ends it on the callback and redirects to the configured
web or mobile completion URL with `?code=` (a 60-second one-time handoff code, stored hashed
in `oauth_handoff_codes`) or `?error=`. `POST /auth/handoff` trades the code plus the client's
verifier for normal tokens. Google's own tokens are never stored. Accounts match on the
NextAuth-era `accounts` row (provider + subject); an email that already has an account is
refused, never auto-linked. Settings live under `circadium.oauth`: `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` are required outside `local` (startup fails otherwise; `local` without
them disables Google sign-in), and the callback URI Google must have registered is
`${AUTH_ISSUER}/login/oauth2/code/google`. The in-memory session is single-instance only, like
the rate limiter.

Abuse controls on the public auth endpoints, two layers:

- `auth/RateLimitFilter` — per-IP Bucket4j buckets held in memory (Caffeine), running
  before Spring Security. Correct only while the server is a single instance.
- `auth/LoginThrottle` — per-email lockout in `auth_lockouts` (5th failure locks 1 min,
  doubling to a 1 h cap, forgotten after 24 h), keyed whether or not the account exists.

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

The token tables (`VerificationToken`, `PasswordResetToken`,
`AccountDeletionToken`, `TwoFactorToken`) hold raw values because the web app reads them
too; tokens are issued for the stored email casing, since the web looks them up exactly.

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
use, and grouped by `familyId`; replaying a rotated token deletes the whole family.
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
