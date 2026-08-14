import type { EngineMessage } from "@/types/prisma";
import {
  buildEngineMessageLookups,
  renderEngineMessage,
} from "@/utils/renderEngineMessage";

// Null-safety for the precedence message types: presentation prose is derived
// from the current entity tree, so a deleted queue or planner on either end
// must degrade to generic labels — never crash, never return null for a
// well-formed payload.

const baseRow = {
  tone: "warn",
  dismissed: false,
  userId: "u",
  createdAt: "",
  updatedAt: "",
};

const emptyLookups = buildEngineMessageLookups([], [], []);

describe("renderEngineMessage precedence types", () => {
  it("QUEUE_SEQUENCE_BROKEN renders with deleted queue and planner", () => {
    const message: EngineMessage = {
      ...baseRow,
      id: "QUEUE_SEQUENCE_BROKEN::gone-queue|gone-planner",
      type: "QUEUE_SEQUENCE_BROKEN",
      payload: {
        type: "QUEUE_SEQUENCE_BROKEN",
        queueId: "gone-queue",
        failedPlannerId: "gone-planner",
      },
    } as unknown as EngineMessage;

    const rendered = renderEngineMessage(message, emptyLookups);
    expect(rendered).not.toBeNull();
    expect(rendered!.tag).toBe("QUEUE");
    expect(rendered!.title).toContain("a queue");
    expect(rendered!.body.join(" ")).toContain("scheduled without waiting");
  });

  it("DEPENDENCY_BROKEN renders both causes with deleted planners", () => {
    for (const cause of ["failed", "unready"] as const) {
      const message: EngineMessage = {
        ...baseRow,
        id: `DEPENDENCY_BROKEN::p|s|${cause}`,
        type: "DEPENDENCY_BROKEN",
        payload: {
          type: "DEPENDENCY_BROKEN",
          predecessorId: "gone-predecessor",
          successorId: "gone-successor",
          cause,
        },
      } as unknown as EngineMessage;

      const rendered = renderEngineMessage(message, emptyLookups);
      expect(rendered).not.toBeNull();
      expect(rendered!.tag).toBe("PREREQUISITE");
      expect(rendered!.body.join(" ")).toContain("scheduled without waiting");
    }
  });

  it("SEQUENCE_PAST_HORIZON renders with a deleted queue on the payload", () => {
    const message: EngineMessage = {
      ...baseRow,
      id: "SEQUENCE_PAST_HORIZON::p|s",
      type: "SEQUENCE_PAST_HORIZON",
      payload: {
        type: "SEQUENCE_PAST_HORIZON",
        source: "queue",
        queueId: "gone-queue",
        predecessorId: "gone-predecessor",
        successorId: "gone-successor",
      },
    } as unknown as EngineMessage;

    const rendered = renderEngineMessage(message, emptyLookups);
    expect(rendered).not.toBeNull();
    expect(rendered!.tag).toBe("HORIZON");
    expect(rendered!.body.join(" ")).toContain("in a queue");
  });

  it("resolves titles from the lookups when the entities exist", () => {
    const planner = [
      { id: "p1", title: "Get a job" },
      { id: "s1", title: "Buy a car" },
    ] as never[];
    const queues = [{ id: "q1", title: "Work", members: [] }] as never[];
    const lookups = buildEngineMessageLookups(planner, [], queues);

    const message: EngineMessage = {
      ...baseRow,
      id: "QUEUE_SEQUENCE_BROKEN::q1|p1",
      type: "QUEUE_SEQUENCE_BROKEN",
      payload: {
        type: "QUEUE_SEQUENCE_BROKEN",
        queueId: "q1",
        failedPlannerId: "p1",
      },
    } as unknown as EngineMessage;

    const rendered = renderEngineMessage(message, lookups);
    expect(rendered!.title).toContain("Work");
    expect(rendered!.body.join(" ")).toContain("Get a job");
  });
});

// Constraint attribution: TOO_LARGE / IMPOSSIBLE_CONSTRAINTS bodies name the
// exact allowed times (with inheritance attribution) and window categories
// involved, keyed by the emit-time limitingAxis fact — degrading to the
// generic copy for legacy payloads or missing entities.
describe("renderEngineMessage constraint attribution", () => {
  const NINE_TO_FIVE = JSON.stringify({
    days: [1, 2, 3, 4, 5],
    ranges: [{ startTime: "09:00", endTime: "17:00" }],
  });

  const makePlanner = (
    over: Record<string, unknown>,
  ): Record<string, unknown> => ({
    parentId: null,
    categoryId: null,
    allowedTimes: null,
    ...over,
  });

  const professional = {
    id: "cat-prof",
    name: "Professional",
    parentId: null,
    confineToOwnWindows: false,
    useTimeWindows: true,
    timeSlots: [
      { id: "w1", day: 1, startTime: "09:00", endTime: "12:00" },
      { id: "w2", day: 2, startTime: "13:00", endTime: "17:00" },
    ],
  };

  function tooLargeMessage(extra: Record<string, unknown>): EngineMessage {
    return {
      ...baseRow,
      id: "TASK_TOO_LARGE::leaf",
      type: "TASK_TOO_LARGE",
      payload: {
        type: "TASK_TOO_LARGE",
        plannerId: "leaf",
        duration: 360,
        maxCapacity: 238,
        ...extra,
      },
    } as unknown as EngineMessage;
  }

  it("renders the generic body for legacy payloads without a limitingAxis", () => {
    const lookups = buildEngineMessageLookups(
      [makePlanner({ id: "leaf", title: "Stripe" })] as never[],
      [],
    );
    const rendered = renderEngineMessage(tooLargeMessage({}), lookups);
    expect(rendered!.body.join(" ")).toContain("Largest available gap");
  });

  it("names the item's own allowed times with day and range detail", () => {
    const lookups = buildEngineMessageLookups(
      [
        makePlanner({ id: "leaf", title: "Stripe", allowedTimes: NINE_TO_FIVE }),
      ] as never[],
      [],
    );
    const rendered = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "allowedTimes" }),
      lookups,
    );
    expect(rendered!.body.join(" ")).toContain("Its allowed times");
    expect(rendered!.body.join(" ")).toContain("Mon–Fri 09:00–17:00");
    expect(rendered!.body.join(" ")).toContain("3h58m");
  });

  it("attributes inherited allowed times to the ancestor that carries them", () => {
    const lookups = buildEngineMessageLookups(
      [
        makePlanner({
          id: "root",
          title: "Launch Circadium",
          allowedTimes: NINE_TO_FIVE,
        }),
        makePlanner({ id: "leaf", title: "Stripe", parentId: "root" }),
      ] as never[],
      [],
    );
    const rendered = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "templateIntersection" }),
      lookups,
    );
    expect(rendered!.body.join(" ")).toContain(
      'the allowed times it inherits from "Launch Circadium"',
    );
    expect(rendered!.body.join(" ")).toContain("weekly templates");
  });

  it("names the category whose largest window bounds the item", () => {
    const lookups = buildEngineMessageLookups(
      [
        makePlanner({ id: "leaf", title: "Stripe", categoryId: "cat-prof" }),
      ] as never[],
      [],
      [],
      [professional] as never[],
    );
    const rendered = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "categoryWindow", maxCapacity: 240 }),
      lookups,
    );
    expect(rendered!.body.join(" ")).toContain('The largest "Professional" window is 4h');
  });

  it("renders the never-fits copy when the template intersection is empty", () => {
    const lookups = buildEngineMessageLookups(
      [
        makePlanner({ id: "leaf", title: "Stripe", categoryId: "cat-prof" }),
      ] as never[],
      [],
      [],
      [professional] as never[],
    );
    const rendered = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "templateIntersection", maxCapacity: 0 }),
      lookups,
    );
    expect(rendered!.body.join(" ")).toContain("Can never be scheduled");
    expect(rendered!.body.join(" ")).toContain('the "Professional" windows');
  });

  it("resolves the queue-lent category for a categoryless root member", () => {
    const lookups = buildEngineMessageLookups(
      [makePlanner({ id: "leaf", title: "Stripe" })] as never[],
      [],
      [
        {
          id: "q1",
          title: "Pipeline",
          categoryId: "cat-prof",
          members: [{ plannerId: "leaf" }],
        },
      ] as never[],
      [professional] as never[],
    );
    const rendered = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "templateIntersection", maxCapacity: 50 }),
      lookups,
    );
    expect(rendered!.body.join(" ")).toContain('the "Professional" windows');
  });

  it("IMPOSSIBLE_CONSTRAINTS names both sides and keeps the generic fallback", () => {
    const withEntities = buildEngineMessageLookups(
      [
        makePlanner({
          id: "leaf",
          title: "Stripe",
          categoryId: "cat-prof",
          allowedTimes: JSON.stringify({ days: [0], ranges: null }),
        }),
      ] as never[],
      [],
      [],
      [professional] as never[],
    );
    const message: EngineMessage = {
      ...baseRow,
      id: "TASK_UNSCHEDULABLE::leaf|IMPOSSIBLE_CONSTRAINTS",
      type: "TASK_UNSCHEDULABLE",
      payload: {
        type: "TASK_UNSCHEDULABLE",
        plannerId: "leaf",
        reason: "IMPOSSIBLE_CONSTRAINTS",
      },
    } as unknown as EngineMessage;

    const specific = renderEngineMessage(message, withEntities);
    expect(specific!.body.join(" ")).toContain("Its allowed times (Sun)");
    expect(specific!.body.join(" ")).toContain('the "Professional" scheduled windows');

    const generic = renderEngineMessage(message, emptyLookups);
    expect(generic!.body.join(" ")).toContain("never overlap");
  });

  it("adds a buffer note when the template-intersection ceiling was buffer-reduced", () => {
    const lookups = buildEngineMessageLookups(
      [
        makePlanner({
          id: "root",
          title: "Launch Circadium",
          allowedTimes: NINE_TO_FIVE,
        }),
        makePlanner({ id: "leaf", title: "Stripe", parentId: "root" }),
      ] as never[],
      [],
    );
    const withBuffer = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "templateIntersection" }),
      lookups,
      2,
    );
    expect(withBuffer!.body.join(" ")).toContain(
      "taking the 2m buffer into account",
    );

    // The note is specific to the buffer-reduced axis: the allowed-times
    // ceiling reports raw fragment sizes, so it never gets the note.
    const otherAxis = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "allowedTimes" }),
      lookups,
      2,
    );
    expect(otherAxis!.body.join(" ")).not.toContain("buffer");
  });

  it("falls back to the generic body when the planner row is gone", () => {
    const rendered = renderEngineMessage(
      tooLargeMessage({ limitingAxis: "templateIntersection" }),
      emptyLookups,
    );
    expect(rendered!.body.join(" ")).toContain("Largest available gap");
  });
});

// LOCATION_OVERLAP: sides are kind-tagged (planner rows or weekly templates)
// and resolve from the current entity tree, degrading to generic labels for
// deleted entities; the card jumps to the earliest overlap.
describe("renderEngineMessage LOCATION_OVERLAP", () => {
  const overlapMessage = (extra: Record<string, unknown>): EngineMessage =>
    ({
      ...baseRow,
      tone: "fail",
      id: "LOCATION_OVERLAP::a|b|loc-a|loc-b",
      type: "LOCATION_OVERLAP",
      payload: {
        type: "LOCATION_OVERLAP",
        firstKind: "planner",
        firstId: "p1",
        secondKind: "template",
        secondId: "t1",
        firstLocationId: "loc-a",
        secondLocationId: "loc-b",
        overlapStart: "2026-01-06T10:00:00.000Z",
        affectedCount: 1,
        ...extra,
      },
    }) as unknown as EngineMessage;

  it("resolves planner, template, and location names from the lookups", () => {
    const lookups = buildEngineMessageLookups(
      [{ id: "p1", title: "Dentist" }] as never[],
      [
        { id: "loc-a", name: "Clinic" },
        { id: "loc-b", name: "Office" },
      ] as never[],
      [],
      [],
      [{ id: "t1", title: "Work hours" }] as never[],
    );

    const rendered = renderEngineMessage(overlapMessage({}), lookups);
    expect(rendered).not.toBeNull();
    expect(rendered!.tag).toBe("CONFLICT");
    expect(rendered!.title).toContain('"Dentist"');
    expect(rendered!.title).toContain('"Work hours"');
    expect(rendered!.body.join(" ")).toContain("Clinic");
    expect(rendered!.body.join(" ")).toContain("Office");
    expect(rendered!.goToDate).toBe("2026-01-06T10:00:00.000Z");
  });

  it("degrades to generic labels when both sides are deleted", () => {
    const rendered = renderEngineMessage(overlapMessage({}), emptyLookups);
    expect(rendered).not.toBeNull();
    expect(rendered!.title).toContain("An item");
    expect(rendered!.title).toContain("a weekly block");
    expect(rendered!.body.join(" ")).toContain("two places at once");
  });

  it("notes recurrence when the conflict folds multiple occurrences", () => {
    const rendered = renderEngineMessage(
      overlapMessage({ affectedCount: 3 }),
      emptyLookups,
    );
    expect(rendered!.body.join(" ")).toContain("Recurs 3×");
  });
});
