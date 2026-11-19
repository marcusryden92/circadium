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

`config/SecurityConfig` is a stateless bearer-token resource server: every request needs
a valid RS256 access JWT except `/actuator/health/**`, `/actuator/info`,
`GET /.well-known/jwks.json`, `POST /auth/refresh`, `POST /auth/logout` and `/error`.
Swagger/OpenAPI is open under the `local` profile and `ROLE_ADMIN` elsewhere. The JWT's
`role` claim maps to `ROLE_USER` / `ROLE_ADMIN`. CSRF is off (no cookie auth yet; 1.9
revisits it).

Token settings live under `circadium.auth` (`auth/AuthProperties`):

- `AUTH_ISSUER` — required outside `local` (defaults to `http://localhost:8080` there).
- Signing keys: `CIRCADIUM_AUTH_SIGNINGKEYS_<n>_KID` + `CIRCADIUM_AUTH_SIGNINGKEYS_<n>_PRIVATEKEY`
  (PKCS#8 PEM). Index 0 signs; all verify and are published in the JWKS. Rotate by
  inserting the new key at index 0 and dropping the old one after an access-token lifetime.
- With no keys configured, `local` generates an ephemeral key (tokens die on restart);
  every other profile refuses to start.

Refresh tokens are opaque, stored only as SHA-256 hashes in `sessions`, rotated on every
use, and grouped by `familyId`; replaying a rotated token deletes the whole family.
Rotated rows must be kept until expiry or reuse becomes undetectable. In tests, use
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
