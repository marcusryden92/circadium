/**
 * @jest-environment node
 */
// Writes the golden fixture the Java bootstrap endpoint is tested against
// (server/src/test/resources/calendar/bootstrap-expected.json): this app's own
// fetchFreshState, run against bootstrap-seed.sql in a scratch database. A Jest
// file rather than a script because Jest is what resolves the "@/" imports here.
//
// Skipped unless CAPTURE_BOOTSTRAP_FIXTURE is set. Run `pnpm fixture:bootstrap`
// from client/web with the dev database container up (`pnpm db:start`).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FreshState } from "@/actions/calendar-actions/fetchFreshState";

const SERVER_TEST_RESOURCES = path.resolve(
  __dirname,
  "../../../../server/src/test/resources",
);
const COMPOSE_FILE = path.resolve(__dirname, "../../docker-compose.dev.yml");
const SCRATCH_DATABASE = "circadium_bootstrap_fixture";
const USER_ID = "bootstrap-user";

// Statements go in on stdin, so psql runs each on its own: CREATE DATABASE
// refuses to run inside the transaction a multi-statement -c would open.
function psql(database: string, sql: string) {
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      COMPOSE_FILE,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "circadium",
      "-d",
      database,
    ],
    {
      input: `SET client_min_messages = warning;\n${sql}`,
      stdio: ["pipe", "ignore", "inherit"],
    },
  );
}

function resource(name: string) {
  return readFileSync(path.join(SERVER_TEST_RESOURCES, name), "utf8");
}

const byId = <T extends { id: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// Prisma returns rows in no set order, so the file is sorted to stay stable
// between captures. Locations keep theirs: oldest first is part of the contract.
function stableOrder(payload: FreshState): FreshState {
  return {
    ...payload,
    planner: byId(payload.planner),
    calendar: byId(payload.calendar),
    template: byId(payload.template),
    categories: byId(payload.categories).map((category) => ({
      ...category,
      timeSlots: byId(category.timeSlots),
    })),
    categoryEvents: byId(payload.categoryEvents),
    travelEvents: byId(payload.travelEvents),
    engineMessages: byId(payload.engineMessages),
    queues: byId(payload.queues).map((queue) => ({
      ...queue,
      members: byId(queue.members),
    })),
    dependencies: byId(payload.dependencies),
    travelTimes: byId(payload.travelTimes),
  };
}

const capture = process.env.CAPTURE_BOOTSTRAP_FIXTURE ? test : test.skip;

capture(
  "captures the TS bootstrap payload as the Java endpoint's golden fixture",
  async () => {
    psql(
      "postgres",
      `DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE);
       CREATE DATABASE ${SCRATCH_DATABASE};`,
    );
    try {
      psql(SCRATCH_DATABASE, resource("db/schema.sql"));
      psql(SCRATCH_DATABASE, resource("calendar/bootstrap-seed.sql"));

      // Set before the first import of lib/db, which reads it once.
      process.env.DATABASE_URL = `postgresql://circadium:circadium@localhost:5433/${SCRATCH_DATABASE}`;
      const { fetchFreshState } = await import(
        "@/actions/calendar-actions/fetchFreshState"
      );
      const { db } = await import("@/lib/db");
      try {
        const payload = stableOrder(await fetchFreshState(USER_ID));
        expect(payload.planner.length).toBeGreaterThan(0);
        writeFileSync(
          path.join(SERVER_TEST_RESOURCES, "calendar/bootstrap-expected.json"),
          JSON.stringify(payload, null, 2) + "\n",
        );
      } finally {
        await db.$disconnect();
      }
    } finally {
      psql("postgres", `DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE);`);
    }
  },
  60_000,
);
