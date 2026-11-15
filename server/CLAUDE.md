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
  `jpa.hibernate.ddl-auto=none`) — Prisma owns migrations until the Phase 2 cutover.
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

There is no custom `SecurityConfig` yet. The default Spring Security chain is active:
startup prints a generated dev password, `/actuator/health` is reachable, and every other
path answers `401`. The real auth chain (and the explicit `permitAll` for health, plus
prod gating of Swagger UI) lands with the auth items (plan 1.5-1.10) — Boot's security
auto-config backs off the moment a custom chain appears, so health must be permitted
explicitly there.

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
