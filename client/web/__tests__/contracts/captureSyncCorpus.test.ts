/**
 * @jest-environment node
 */
// Writes the golden corpus the Java sync endpoint is tested against
// (server/src/test/resources/sync/corpus/). Each scenario starts from
// calendar/bootstrap-seed.sql, edits the state fetchFreshState returns the way
// the client would, diffs it with the shared compareData the client runs,
// sends the diff through this app's own syncCalendarData, and records the
// diff, the response and every row the sync can write afterwards (the shared
// sync/dump-state.sql). SyncCorpusIntegrationTest replays each diff against the
// Java endpoint and compares. A Jest file for the same reason as
// captureBootstrapFixture: Jest is what resolves the "@/" imports.
//
// The clock is frozen at FROZEN_NOW, which the Java test's clock matches, so the
// sync's own updatedAt stamps compare exactly. createdAt values the column
// default fills, (now())::text, cannot be frozen and are recorded as a marker.
//
// Skipped unless CAPTURE_SYNC_CORPUS is set. Run `pnpm fixture:sync` from
// client/web with the dev database container up (`pnpm db:start`).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FreshState } from "@/actions/calendar-actions/fetchFreshState";
import type {
  DatabaseChanges,
  SyncInputs,
} from "@/utils/server-handlers/compareCalendarData";
import type { Planner } from "@/types/prisma";

// A relative path: the "@/" alias is rewritten in imports by the compiler, not
// resolved by Jest, so jest.mock cannot take it.
jest.mock("../../auth", () => ({
  auth: async () => ({ user: { id: "bootstrap-user" } }),
}));

const SERVER_TEST_RESOURCES = path.resolve(
  __dirname,
  "../../../../server/src/test/resources",
);
const CORPUS_DIR = path.join(SERVER_TEST_RESOURCES, "sync/corpus");
const COMPOSE_FILE = path.resolve(__dirname, "../../docker-compose.dev.yml");
const SCRATCH_DATABASE = "circadium_sync_corpus";
const USER_ID = "bootstrap-user";
const OTHER_ID = "bootstrap-other";
const FROZEN_NOW = "2026-03-02T06:00:00.000Z";
// When the client created the rows a scenario adds; earlier than FROZEN_NOW.
const CLIENT_CREATED = "2026-03-01T20:00:00.000Z";
const COLUMN_DEFAULT = "<column default>";
const DB_TEXT_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$/;

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

function byId<T extends { id: string }>(rows: T[], id: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`No row ${id} in the seed state`);
  return row;
}

const sortedById = <T extends { id: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

function planner(
  fields: Partial<Planner> & Pick<Planner, "id" | "title" | "plannerType">,
): Planner {
  return {
    parentId: null,
    isReady: true,
    isTriaged: true,
    duration: 30,
    deadline: null,
    starts: null,
    recurrence: null,
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 3,
    userId: USER_ID,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: CLIENT_CREATED,
    updatedAt: CLIENT_CREATED,
    ...fields,
  };
}

function emptyChanges(): DatabaseChanges {
  const group = () => ({ create: [], update: [], destroy: [] });
  return {
    planner: group(),
    calendar: group(),
    template: group(),
    extendedProps: group(),
    category: group(),
    categoryTimeWindow: group(),
    categoryEvent: group(),
    travelEvent: group(),
    engineMessage: group(),
    queue: group(),
    queueMember: group(),
    dependency: group(),
    location: group(),
    travelTime: group(),
  };
}

function writeCount(changes: DatabaseChanges): number {
  return Object.values(changes).reduce(
    (sum, group) =>
      sum + group.create.length + group.update.length + group.destroy.length,
    0,
  );
}

type Engine = typeof import("@circadium/shared/engine/calendarGeneration");

type Scenario = {
  name: string;
  description: string;
  expect: "saved" | "stale";
  clientKnownDataVersion?: number;
  // Either edits the client's state, which compareData then diffs, or builds a
  // diff by hand (for rows a real client could not hold).
  edit?: (state: FreshState, engine: Engine) => void;
  changes?: (other: FreshState) => DatabaseChanges;
  minWrites?: number;
};

const SCENARIOS: Scenario[] = [
  {
    name: "01-planners-and-categories",
    description:
      "A new category and a goal filed under it in the same sync (the FK order), a child task, and edits to existing planner items and a category.",
    expect: "saved",
    edit: (s) => {
      s.categories.push({
        id: "sync-category-health",
        name: "Health",
        icon: null,
        color: "#22aa66",
        sortOrder: 2,
        useTimeWindows: false,
        isStrict: false,
        confineToOwnWindows: false,
        locationId: null,
        parentId: null,
        userId: USER_ID,
        createdAt: CLIENT_CREATED,
        updatedAt: CLIENT_CREATED,
        timeSlots: [],
      });
      s.planner.push(
        planner({
          id: "sync-planner-run",
          title: "Run a 10k",
          plannerType: "goal",
          categoryId: "sync-category-health",
          deadline: "2026-05-01T00:00:00.000Z",
        }),
        planner({
          id: "sync-planner-run-1",
          title: "Easy run",
          plannerType: "task",
          parentId: "sync-planner-run",
          duration: 40,
          sortOrder: 0.5,
          isReady: null,
        }),
      );
      Object.assign(byId(s.planner, "bootstrap-planner-task"), {
        title: "Flashcards (deck 2)",
        duration: 50,
        sortOrder: 2.75,
        notes: null,
        isReady: true,
        completedSegments: null,
        completedStartTime: null,
        completedEndTime: null,
      });
      Object.assign(byId(s.planner, "bootstrap-planner-goal"), {
        categoryId: null,
        deadline: "2026-07-31T00:00:00.000Z",
        allowedTimes: null,
      });
      Object.assign(byId(s.categories, "bootstrap-category-b"), {
        name: "Focus",
        color: "#123456",
        isStrict: true,
        parentId: null,
      });
    },
  },
  {
    name: "02-planner-delete",
    description:
      "Deleting a planner item, with the dependency, queue membership and detour link the client prunes alongside it.",
    expect: "saved",
    edit: (s) => {
      s.planner = s.planner.filter((p) => p.id !== "bootstrap-planner-plan");
      byId(s.planner, "bootstrap-planner-task").linkedItemId = null;
      s.dependencies = [];
      const reading = byId(s.queues, "bootstrap-queue-1");
      reading.members = reading.members.filter(
        (m) => m.plannerId !== "bootstrap-planner-plan",
      );
    },
  },
  {
    name: "03-calendar-and-extended-props",
    description:
      "An event moved with its props changed under a new props id (the upsert keeps the row's id), an event deleted with its props, a new event whose props omit the runtime-optional trespass flags and carry runtime-only fields, and an event without props renamed.",
    expect: "saved",
    edit: (s) => {
      const moved = byId(s.calendar, "bootstrap-event-1");
      Object.assign(moved, {
        start: "2026-03-03T09:00:00.000Z",
        end: "2026-03-03T09:45:00.000Z",
      });
      Object.assign(moved.extendedProps!, {
        id: "sync-props-1-regenerated",
        completedEndTime: "2026-03-03T09:45:00.000Z",
        trespassingStart: false,
        trespassingEnd: true,
      });
      s.calendar = s.calendar.filter((e) => e.id !== "bootstrap-event-3");
      byId(s.calendar, "bootstrap-event-2").title = "Weekly review (moved)";
      const props = {
        id: "sync-props-new",
        plannerType: "task",
        eventType: "planner",
        completedStartTime: null,
        completedEndTime: null,
        parentId: "bootstrap-planner-goal",
        eventId: "sync-event-new",
        wrapperId: null,
        travelMinutes: null,
      };
      s.calendar.push({
        id: "sync-event-new",
        title: "Easy run",
        start: "2026-03-04T17:00:00.000Z",
        end: "2026-03-04T17:40:00.000Z",
        duration: 40,
        userId: USER_ID,
        rrule: null,
        backgroundColor: "#22aa66",
        borderColor: "#22aa66",
        createdAt: "",
        updatedAt: "",
        extendedProps: props as unknown as FreshState["calendar"][number]["extendedProps"],
      });
    },
  },
  {
    name: "04-templates-and-time-windows",
    description:
      "A template moved to another weekday, one deleted, one created on Saturday; a category window edited, one deleted, one created under another category.",
    expect: "saved",
    edit: (s) => {
      Object.assign(byId(s.template, "bootstrap-template-1"), {
        startDay: 3,
        startTime: "06:30",
        color: "#ff8800",
        locationId: null,
      });
      s.template = s.template.filter((t) => t.id !== "bootstrap-template-2");
      s.template.push({
        id: "sync-template-new",
        title: "Long run",
        startDay: 6,
        startTime: "08:00",
        userId: USER_ID,
        duration: 90,
        color: null,
        locationId: "bootstrap-location-b",
        recurrenceExceptions: null,
        createdAt: CLIENT_CREATED,
        updatedAt: CLIENT_CREATED,
      });
      const work = byId(s.categories, "bootstrap-category-a");
      Object.assign(byId(work.timeSlots, "bootstrap-window-1"), {
        endTime: "11:30",
        recurrenceExceptions: null,
      });
      work.timeSlots = work.timeSlots.filter(
        (w) => w.id !== "bootstrap-window-2",
      );
      byId(s.categories, "bootstrap-category-b").timeSlots.push({
        id: "sync-window-new",
        day: 1,
        startTime: "14:00",
        endTime: "16:00",
        recurrenceExceptions: '{"2026-03-09":{"deleted":true}}',
        categoryId: "bootstrap-category-b",
        userId: USER_ID,
      });
    },
  },
  {
    name: "05-queues-and-dependencies",
    description:
      "A new queue with a member in the same sync, a member moved between queues, a member removed, queue edits, and a dependency swapped for another.",
    expect: "saved",
    edit: (s) => {
      const reading = byId(s.queues, "bootstrap-queue-1");
      Object.assign(reading, { title: "Reading list", color: null });
      const moved = byId(reading.members, "bootstrap-member-1");
      reading.members = [];
      const empty = byId(s.queues, "bootstrap-queue-2");
      empty.sortOrder = 5;
      empty.members.push({
        ...moved,
        queueId: "bootstrap-queue-2",
        sortOrder: 0.5,
      });
      s.queues.push({
        id: "sync-queue-new",
        title: "Practice",
        sortOrder: 2,
        color: "#abcdef",
        categoryId: "bootstrap-category-b",
        userId: USER_ID,
        createdAt: CLIENT_CREATED,
        updatedAt: CLIENT_CREATED,
        members: [
          {
            id: "sync-member-new",
            sortOrder: 0,
            queueId: "sync-queue-new",
            plannerId: "bootstrap-planner-task",
            userId: USER_ID,
            createdAt: CLIENT_CREATED,
            updatedAt: CLIENT_CREATED,
          },
        ],
      });
      s.dependencies = [
        {
          id: "sync-dependency-new",
          predecessorId: "bootstrap-planner-task",
          successorId: "bootstrap-planner-plan",
          userId: USER_ID,
          createdAt: CLIENT_CREATED,
          updatedAt: CLIENT_CREATED,
        },
      ];
    },
  },
  {
    name: "06-engine-output",
    description:
      "Engine-derived rows as a regen leaves them: category and travel events rewritten, created and deleted (with the engine's empty timestamps), a message dismissed, one deleted, one created, and a payload replaced with awkward JSON.",
    expect: "saved",
    edit: (s) => {
      Object.assign(byId(s.categoryEvents, "bootstrap-category-event-1"), {
        start: "2026-03-01T09:30:00.000Z",
        trespassingEnd: false,
        createdAt: "",
        updatedAt: "",
      });
      s.categoryEvents.push({
        id: "sync-category-event-new",
        start: "2026-03-07T13:00:00.000Z",
        end: "2026-03-07T17:00:00.000Z",
        trespassingStart: true,
        trespassingEnd: false,
        categoryTimeWindowId: "bootstrap-window-2",
        categoryId: "bootstrap-category-a",
        userId: USER_ID,
        createdAt: "",
        updatedAt: "",
      });
      s.travelEvents = s.travelEvents.filter(
        (e) => e.id !== "bootstrap-travel-event-1",
      );
      Object.assign(byId(s.travelEvents, "bootstrap-travel-event-2"), {
        travelMinutes: 18,
        insufficientTravel: false,
        requiredTravelMinutes: null,
        createdAt: "",
        updatedAt: "",
      });
      s.travelEvents.push({
        id: "sync-travel-event-new",
        start: "2026-03-04T16:48:00.000Z",
        end: "2026-03-04T17:00:00.000Z",
        fromLocationId: "bootstrap-location-a",
        toLocationId: null,
        travelMinutes: 12,
        requiredTravelMinutes: 12,
        insufficientTravel: false,
        overconstrained: false,
        userId: USER_ID,
        createdAt: "",
        updatedAt: "",
      });
      byId(s.engineMessages, "bootstrap-message-1").dismissed = true;
      s.engineMessages = s.engineMessages.filter(
        (m) => m.id !== "bootstrap-message-2",
      );
      byId(s.engineMessages, "bootstrap-message-3").payload = {
        nested: { list: [1, 2.5, -3e-7, 1e21, "x", null, true, false], empty: {} },
        "key with spaces": 'café "quoted" \\ back',
      };
      s.engineMessages.push({
        id: "sync-message-new",
        type: "unscheduled",
        tone: "warning",
        payload: { plannerId: "bootstrap-planner-task", reason: "NO_SLOTS" },
        dismissed: false,
        userId: USER_ID,
        createdAt: "",
        updatedAt: "",
      });
    },
  },
  {
    name: "07-locations-and-travel-times",
    description:
      "A location renamed and travel-time overrides set and cleared.",
    expect: "saved",
    edit: (s) => {
      byId(s.locations, "bootstrap-location-a").name = "Office (HQ)";
      Object.assign(byId(s.travelTimes, "bootstrap-travel-time-1"), {
        customRushHourMinutes: 25,
        customRegularMinutes: 18,
      });
      Object.assign(byId(s.travelTimes, "bootstrap-travel-time-2"), {
        customRushHourMinutes: null,
        customNightMinutes: null,
      });
    },
  },
  {
    name: "08-location-delete",
    description:
      "A location deleted; its travel times go with it by cascade and the references to it are cleared by set-null.",
    expect: "saved",
    edit: (s) => {
      s.locations = s.locations.filter((l) => l.id !== "bootstrap-location-b");
      s.travelTimes = [];
    },
  },
  {
    name: "09-foreign-and-missing-ids",
    description:
      "A hand-built diff aimed at the other account's rows and at ids that do not exist: every write is a no-op, a create colliding with the other account's id is skipped, and the version still moves.",
    expect: "saved",
    changes: (other) => {
      const c = emptyChanges();
      const theirPlanner = byId(other.planner, "bootstrap-other-planner");
      c.planner.create.push(
        planner({
          id: "bootstrap-other-planner",
          title: "Collides with theirs",
          plannerType: "task",
        }),
      );
      c.planner.update.push({ ...theirPlanner, title: "Hijacked" });
      c.planner.destroy.push(theirPlanner);
      const { extendedProps: theirProps, ...theirEvent } = byId(
        other.calendar,
        "bootstrap-other-event",
      );
      c.calendar.update.push({ ...theirEvent, title: "Hijacked" });
      c.calendar.update.push({
        ...theirEvent,
        id: "sync-event-missing",
        title: "Never existed",
      });
      c.calendar.destroy.push(theirEvent);
      c.extendedProps.update.push({
        ...theirProps!,
        plannerType: "goal",
        trespassingStart: true,
        trespassingEnd: true,
      });
      c.extendedProps.destroy.push(theirProps!);
      const theirTemplate = byId(other.template, "bootstrap-other-template");
      c.template.update.push({ ...theirTemplate, startDay: 0 });
      c.template.destroy.push(theirTemplate);
      const { timeSlots: theirWindows, ...theirCategory } = byId(
        other.categories,
        "bootstrap-other-category",
      );
      c.category.update.push({ ...theirCategory, name: "Hijacked" });
      c.category.destroy.push(theirCategory);
      c.categoryTimeWindow.update.push({ ...theirWindows[0], endTime: "23:00" });
      c.categoryTimeWindow.destroy.push(theirWindows[0]);
      c.categoryEvent.destroy.push(
        byId(other.categoryEvents, "bootstrap-other-category-event"),
      );
      c.travelEvent.destroy.push(
        byId(other.travelEvents, "bootstrap-other-travel-event"),
      );
      const theirMessage = byId(other.engineMessages, "bootstrap-other-message");
      c.engineMessage.update.push({ ...theirMessage, dismissed: true });
      c.engineMessage.destroy.push(theirMessage);
      const { members: theirMembers, ...theirQueue } = byId(
        other.queues,
        "bootstrap-other-queue",
      );
      c.queue.update.push({ ...theirQueue, title: "Hijacked" });
      c.queue.destroy.push(theirQueue);
      c.queueMember.update.push({ ...theirMembers[0], sortOrder: 9 });
      c.queueMember.destroy.push(theirMembers[0]);
      const theirLocation = byId(other.locations, "bootstrap-other-location");
      c.location.update.push({ ...theirLocation, name: "Mine now" });
      c.location.destroy.push(theirLocation);
      c.travelTime.update.push({
        ...byId(other.travelTimes, "bootstrap-other-travel-time"),
        customRushHourMinutes: 99,
      });
      return c;
    },
  },
  {
    name: "10-empty-diff",
    description:
      "Nothing changed: the sync succeeds without moving the version.",
    expect: "saved",
    edit: () => {},
  },
  {
    name: "11-stale",
    description:
      "A diff computed against an older version: nothing is written and the response carries the current state.",
    expect: "stale",
    clientKnownDataVersion: 6,
    edit: (s) => {
      byId(s.planner, "bootstrap-planner-goal").title = "Lost edit";
    },
  },
  {
    name: "12-first-regen",
    description:
      "The load case: sixty tasks added under a new goal, then a real engine regen over the whole state, the shape of the first regen after a load.",
    expect: "saved",
    minWrites: 200,
    edit: (s, engine) => {
      s.planner.push(
        planner({
          id: "sync-regen-goal",
          title: "Thesis",
          plannerType: "goal",
          categoryId: "bootstrap-category-a",
          deadline: "2026-04-30T00:00:00.000Z",
        }),
      );
      for (let i = 0; i < 60; i++) {
        s.planner.push(
          planner({
            id: `sync-regen-task-${String(i).padStart(2, "0")}`,
            title: `Thesis section ${i + 1}`,
            plannerType: "task",
            parentId: "sync-regen-goal",
            duration: 30 + (i % 4) * 15,
            sortOrder: i,
          }),
        );
      }
      const result = engine.generateCalendar(
        USER_ID,
        1,
        s.template as never,
        s.planner as never,
        s.calendar as never,
        {
          bufferTimeMinutes: 10,
          categories: s.categories as never,
          queues: s.queues as never,
          dependencies: s.dependencies as never,
          previousEngineMessages: s.engineMessages as never,
        },
      );
      s.calendar = result.events as never;
      s.categoryEvents = result.categoryEvents as never;
      s.travelEvents = result.travelEvents as never;
      s.engineMessages = result.messages as never;
    },
  },
];

function diff(previous: FreshState, current: FreshState): DatabaseChanges {
  const pair = <K extends keyof FreshState>(key: K) => ({
    current: current[key],
    previous: previous[key],
  });
  return compareData({
    planner: pair("planner"),
    calendar: pair("calendar"),
    template: pair("template"),
    categories: pair("categories"),
    categoryEvents: pair("categoryEvents"),
    travelEvents: pair("travelEvents"),
    engineMessages: pair("engineMessages"),
    queues: pair("queues"),
    dependencies: pair("dependencies"),
    locations: pair("locations"),
    travelTimes: pair("travelTimes"),
  } as unknown as SyncInputs);
}

let compareData: (inputs: SyncInputs) => DatabaseChanges;

// fetchFreshState returns rows in no set order; sorted so the file stays stable.
function stableOrder(payload: FreshState): FreshState {
  return {
    ...payload,
    planner: sortedById(payload.planner),
    calendar: sortedById(payload.calendar),
    template: sortedById(payload.template),
    categories: sortedById(payload.categories).map((category) => ({
      ...category,
      timeSlots: sortedById(category.timeSlots),
    })),
    categoryEvents: sortedById(payload.categoryEvents),
    travelEvents: sortedById(payload.travelEvents),
    engineMessages: sortedById(payload.engineMessages),
    queues: sortedById(payload.queues).map((queue) => ({
      ...queue,
      members: sortedById(queue.members),
    })),
    dependencies: sortedById(payload.dependencies),
    travelTimes: sortedById(payload.travelTimes),
  };
}

// The column default's (now())::text is the one value the frozen clock cannot
// fix; SyncCorpusIntegrationTest applies the same replacement to its own dump.
function markColumnDefaults(state: Record<string, Record<string, unknown>[]>) {
  for (const rows of Object.values(state)) {
    for (const row of rows) {
      if (
        typeof row.createdAt === "string" &&
        DB_TEXT_TIMESTAMP.test(row.createdAt)
      ) {
        row.createdAt = COLUMN_DEFAULT;
      }
    }
  }
  return state;
}

const capture = process.env.CAPTURE_SYNC_CORPUS ? test : test.skip;

capture(
  "captures the TS sync's effect as the Java endpoint's golden corpus",
  async () => {
    jest.useFakeTimers({
      now: new Date(FROZEN_NOW),
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    // The engine and the sync log progress; the corpus files are the output.
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});

    psql(
      "postgres",
      `DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE);
       CREATE DATABASE ${SCRATCH_DATABASE};`,
    );
    try {
      psql(SCRATCH_DATABASE, resource("db/schema.sql"));

      // Set before the first import of lib/db, which reads it once.
      process.env.DATABASE_URL = `postgresql://circadium:circadium@localhost:5433/${SCRATCH_DATABASE}`;
      const { syncCalendarData } = await import(
        "@/actions/calendar-actions/syncCalendarData"
      );
      const { fetchFreshState } = await import(
        "@/actions/calendar-actions/fetchFreshState"
      );
      const { db } = await import("@/lib/db");
      ({ compareData } = await import(
        "@/utils/server-handlers/compareCalendarData"
      ));
      const engine = await import(
        "@circadium/shared/engine/calendarGeneration"
      );
      const dumpSql = resource("sync/dump-state.sql");

      rmSync(CORPUS_DIR, { recursive: true, force: true });
      mkdirSync(CORPUS_DIR, { recursive: true });
      try {
        for (const scenario of SCENARIOS) {
          psql(
            SCRATCH_DATABASE,
            `TRUNCATE "users" CASCADE;\n${resource("calendar/bootstrap-seed.sql")}`,
          );
          const previous = await fetchFreshState(USER_ID);
          let changes: DatabaseChanges;
          if (scenario.changes) {
            changes = scenario.changes(await fetchFreshState(OTHER_ID));
          } else {
            const current = structuredClone(previous);
            scenario.edit!(current, engine);
            changes = diff(previous, current);
          }
          // Through JSON, as the request body travels.
          changes = JSON.parse(JSON.stringify(changes));
          const clientKnownDataVersion =
            scenario.clientKnownDataVersion ?? previous.dataVersion;

          const response = await syncCalendarData(
            changes,
            clientKnownDataVersion,
          );
          const [{ state }] = await db.$queryRawUnsafe<{ state: string }[]>(
            dumpSql,
          );

          if (scenario.expect === "saved") {
            expect(response).toMatchObject({ success: true });
          } else {
            expect(response).toMatchObject({ success: false, reason: "stale" });
          }
          if (scenario.minWrites) {
            expect(writeCount(changes)).toBeGreaterThanOrEqual(
              scenario.minWrites,
            );
          }

          writeFileSync(
            path.join(CORPUS_DIR, `${scenario.name}.json`),
            JSON.stringify(
              {
                description: scenario.description,
                writes: writeCount(changes),
                clientKnownDataVersion,
                changes,
                response:
                  !response.success && response.reason === "stale"
                    ? { ...response, freshState: stableOrder(response.freshState) }
                    : response,
                after: markColumnDefaults(JSON.parse(state)),
              },
              null,
              2,
            ) + "\n",
          );
        }
      } finally {
        await db.$disconnect();
      }
    } finally {
      psql(
        "postgres",
        `DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE);`,
      );
      jest.useRealTimers();
    }
  },
  120_000,
);
