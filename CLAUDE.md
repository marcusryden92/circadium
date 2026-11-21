# Circadium — Monorepo Root

Circadium is a personal scheduling app. This repository is a monorepo with two
top-level halves that share no tooling:

```
circadium/
├── client/            # pnpm workspace — ALL JS/TS lives here
│   ├── pnpm-workspace.yaml, package.json, .npmrc, tsconfig.base.json
│   ├── web/           # the Next.js web app (pnpm package "web")
│   ├── mobile/        # Expo app (not yet created)
│   └── shared/        # shared TS: domain, engine, contracts, state, sync (@circadium/shared)
└── server/            # Spring Boot / Maven / Java 25 API
```

- **Run all pnpm commands from `client/`**, not the repo root — there is no
  `package.json` at the root. The workspace is rooted inside `client/` so the
  Java `server/` has no JS tooling near it.
- **`.github/`** stays at the repo root (GitHub requires it there); `ci.yml` runs
  in `client/` and `server-ci.yml` in `server/`.

## Where the real documentation is

- **[client/web/CLAUDE.md](client/web/CLAUDE.md)** — the full map of the web app
  (stack, domain model, scheduling engine, AI assistant, state flow, styling,
  Prisma, routes). All paths in it are relative to `client/web/`. **Read it
  before working anywhere under `client/web/`.**
- **[server/CLAUDE.md](server/CLAUDE.md)** — the Java API: stack, build,
  deploys, configuration, and the auth design.
- **[_notes/java-backend-steps/0.0a.java-backend-plan.md](_notes/java-backend-steps/0.0a.java-backend-plan.md)**
  — the migration plan (Java backend + Expo mobile). `_notes/` is personal
  scratch, not documentation — do not quote it as authority.

## Project-wide rules (apply everywhere)

- No emojis in code, comments, or generated docs.
- No narration comments ("// fixed to handle X"). Comments explain *why*, not *what*.
- No summary / changelog / refactor-notes / migration-notes markdown files in the repo.
- Spell out "category" — never "cat". The location surface is "Locations", never "Places".
