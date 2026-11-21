# LifePlan

A personal scheduling and task management application that automatically generates optimized calendar schedules from tasks, goals, and recurring templates.

## What It Does

- Define tasks with durations, deadlines, and priorities
- Organize tasks into goals with hierarchical subtask structures
- Set up recurring weekly templates (work blocks, sleep, routines)
- Assign locations to tasks for travel-aware scheduling
- Group tasks into categories with time-based constraints
- Automatically generate a weekly calendar that places everything optimally

The scheduling engine considers task urgency, location proximity, category time windows, and travel time between locations to produce a schedule that minimizes wasted time and respects all constraints.

## Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript
- **UI:** shadcn/ui, Radix UI, Tailwind CSS, FullCalendar
- **State:** Redux Toolkit, React Context
- **Backend:** Next.js Server Actions, Prisma ORM, PostgreSQL
- **Auth:** the Spring Boot API in `server/` (RS256 access JWT + rotated refresh token, as HttpOnly cookies for the web)

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Fill in DATABASE_URL, the Google/Microsoft calendar credentials, etc.
# Sign-in needs the Java API running locally (server/, port 8080).

# Push schema to database
pnpm prisma generate
pnpm prisma db push

# Seed with test data (optional)
pnpm prisma db seed

# Start development server
pnpm dev
```

## Local Postgres Workflow

```bash
pnpm db:start                  # Spin up Dockerized Postgres
pnpm db:stop                   # Shut it down
pnpm db:seed                   # Run seed script
pnpm prisma:migrate:deploy     # Apply migrations
pnpm db:reset:dev              # Wipe, restart, migrate, and re-seed
pnpm db:studio                 # Open Prisma Studio in browser
```

## Project Structure

- `app/` - Next.js routes and pages
- `actions/` - Server actions for all data operations
- `components/` - React components
- `utils/calendar-generation/` - The scheduling engine (see `docs/calendar-generation.md`)
- `prisma/` - Database schema and seed data
- `redux/` - Client-side state management

## Documentation

- [CLAUDE.md](CLAUDE.md) - Full project reference for AI assistants
- [docs/calendar-generation.md](docs/calendar-generation.md) - Deep dive into the scheduling engine
