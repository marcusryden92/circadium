import { compareData } from "../../sync/compareCalendarData";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  CategoryTimeWindow,
  Queue,
  QueueMember,
  SerializedLocation,
  SerializedTravelTime,
} from "../../contracts";

const planner = (id: string, extra: Partial<Planner> = {}): Planner =>
  ({ id, title: id, duration: 60, ...extra }) as unknown as Planner;

const event = (id: string, extra: Record<string, unknown> = {}): SimpleEvent =>
  ({
    id,
    title: id,
    start: "2026-01-01T09:00:00.000Z",
    end: "2026-01-01T10:00:00.000Z",
    ...extra,
  }) as unknown as SimpleEvent;

const window = (
  id: string,
  extra: Record<string, unknown> = {},
): CategoryTimeWindow =>
  ({ id, day: 1, start: "09:00", end: "10:00", ...extra }) as unknown as CategoryTimeWindow;

const category = (
  id: string,
  timeSlots: CategoryTimeWindow[] = [],
  extra: Record<string, unknown> = {},
): Category =>
  ({ id, name: id, timeSlots, ...extra }) as unknown as Category;

const location = (id: string, name: string): SerializedLocation =>
  ({ id, name, address: `${name} St`, placeId: `place-${id}` });

const travelTime = (
  id: string,
  customRegularMinutes: number | null,
): SerializedTravelTime =>
  ({
    id,
    fromLocationId: "a",
    toLocationId: "b",
    transportMode: "DRIVING",
    googleRushHourMinutes: 10,
    googleRegularMinutes: 8,
    googleNightMinutes: 6,
    customRushHourMinutes: null,
    customRegularMinutes,
    customNightMinutes: null,
    unroutable: false,
  }) as unknown as SerializedTravelTime;

const template = (
  id: string,
  extra: Record<string, unknown> = {},
): EventTemplate =>
  ({ id, title: id, startDay: 1, startTime: "09:00", duration: 60, ...extra }) as unknown as EventTemplate;

const member = (id: string, updatedAt: string): QueueMember =>
  ({
    id,
    sortOrder: 0,
    queueId: "q1",
    plannerId: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  }) as unknown as QueueMember;

const queue = (
  id: string,
  members: QueueMember[] = [],
  extra: Record<string, unknown> = {},
): Queue =>
  ({ id, title: id, sortOrder: 0, members, ...extra }) as unknown as Queue;

const emptyPair = { current: [], previous: [] };

describe("compareData — planner diff", () => {
  it("creates rows present only in current", () => {
    const changes = compareData({
      planner: { current: [planner("p1")], previous: [] },
      calendar: emptyPair,
    });
    expect(changes.planner.create.map((p) => p.id)).toEqual(["p1"]);
    expect(changes.planner.update).toEqual([]);
    expect(changes.planner.destroy).toEqual([]);
  });

  it("updates rows whose fields changed", () => {
    const changes = compareData({
      planner: {
        current: [planner("p1", { title: "renamed" })],
        previous: [planner("p1")],
      },
      calendar: emptyPair,
    });
    expect(changes.planner.update.map((p) => p.id)).toEqual(["p1"]);
    expect(changes.planner.create).toEqual([]);
  });

  it("leaves unchanged rows out of every group", () => {
    const changes = compareData({
      planner: { current: [planner("p1")], previous: [planner("p1")] },
      calendar: emptyPair,
    });
    expect(changes.planner.create).toEqual([]);
    expect(changes.planner.update).toEqual([]);
    expect(changes.planner.destroy).toEqual([]);
  });

  it("destroys rows present only in previous", () => {
    const changes = compareData({
      planner: { current: [], previous: [planner("p1")] },
      calendar: emptyPair,
    });
    expect(changes.planner.destroy.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("compareData — calendar / extendedProps split", () => {
  it("splits a created event into its core row and its extendedProps row", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: {
        current: [event("e1", { extendedProps: { eventType: "planner" } })],
        previous: [],
      },
    });
    expect(changes.calendar.create).toHaveLength(1);
    expect("extendedProps" in changes.calendar.create[0]).toBe(false);
    expect(changes.extendedProps.create).toEqual([
      { eventType: "planner", eventId: "e1" },
    ]);
  });

  it("emits an extendedProps update when only the related row changed", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: {
        current: [event("e1", { extendedProps: { eventType: "planner", note: "b" } })],
        previous: [event("e1", { extendedProps: { eventType: "planner", note: "a" } })],
      },
    });
    expect(changes.extendedProps.update).toEqual([
      { eventType: "planner", note: "b", eventId: "e1" },
    ]);
  });
});

describe("compareData — category windows flatten into their own group", () => {
  it("diffs windows by id independently of their parent category", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: emptyPair,
      categories: {
        current: [category("c1", [window("w1"), window("w2", { end: "11:00" })])],
        previous: [category("c1", [window("w1"), window("w3")])],
      },
    });
    expect(changes.category.create).toEqual([]);
    expect(changes.category.update).toEqual([]);
    expect(changes.categoryTimeWindow.create.map((w) => w.id)).toEqual(["w2"]);
    expect(changes.categoryTimeWindow.destroy.map((w) => w.id)).toEqual(["w3"]);
  });
});

describe("compareData — server-authoritative create paths are skipped", () => {
  it("never creates locations (Google Places owns that), but updates and destroys them", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: emptyPair,
      locations: {
        current: [location("l1", "Renamed"), location("l2", "New")],
        previous: [location("l1", "Original"), location("l3", "Gone")],
      },
    });
    expect(changes.location.create).toEqual([]);
    expect(changes.location.update.map((l) => l.id)).toEqual(["l1"]);
    expect(changes.location.destroy.map((l) => l.id)).toEqual(["l3"]);
  });

  it("only updates travel times (create needs a distance lookup)", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: emptyPair,
      travelTimes: {
        current: [travelTime("t1", 12), travelTime("t2", null)],
        previous: [travelTime("t1", null)],
      },
    });
    expect(changes.travelTime.create).toEqual([]);
    expect(changes.travelTime.update.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("compareData — createdAt/updatedAt never count as a content change", () => {
  const stamps = (updatedAt: string) => ({
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  });
  const OLD = "2026-01-01T00:00:00.000Z";
  const NEW = "2026-02-01T00:00:00.000Z";

  it("planner: a changed updatedAt alone is not an update", () => {
    const changes = compareData({
      planner: {
        current: [planner("p1", stamps(NEW))],
        previous: [planner("p1", stamps(OLD))],
      },
      calendar: emptyPair,
    });
    expect(changes.planner.update).toEqual([]);
    expect(changes.planner.create).toEqual([]);
  });

  it("calendar: a changed updatedAt alone touches neither the event nor its props", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: {
        current: [event("e1", { ...stamps(NEW), extendedProps: { eventType: "planner" } })],
        previous: [event("e1", { ...stamps(OLD), extendedProps: { eventType: "planner" } })],
      },
    });
    expect(changes.calendar.update).toEqual([]);
    expect(changes.extendedProps.update).toEqual([]);
  });

  it("template: a changed updatedAt alone is not an update", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: emptyPair,
      template: {
        current: [template("t1", stamps(NEW))],
        previous: [template("t1", stamps(OLD))],
      },
    });
    expect(changes.template.update).toEqual([]);
  });

  it("category: a changed updatedAt alone is not an update", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: emptyPair,
      categories: {
        current: [category("c1", [], stamps(NEW))],
        previous: [category("c1", [], stamps(OLD))],
      },
    });
    expect(changes.category.update).toEqual([]);
  });

  it("queue + member: a changed updatedAt alone is not an update on either", () => {
    const changes = compareData({
      planner: emptyPair,
      calendar: emptyPair,
      queues: {
        current: [queue("q1", [member("m1", NEW)], stamps(NEW))],
        previous: [queue("q1", [member("m1", OLD)], stamps(OLD))],
      },
    });
    expect(changes.queue.update).toEqual([]);
    expect(changes.queueMember.update).toEqual([]);
  });

  it("still flags a real content change that rides alongside a new updatedAt", () => {
    const changes = compareData({
      planner: {
        current: [planner("p1", { title: "renamed", ...stamps(NEW) })],
        previous: [planner("p1", stamps(OLD))],
      },
      calendar: emptyPair,
    });
    expect(changes.planner.update.map((p) => p.id)).toEqual(["p1"]);
  });
});
