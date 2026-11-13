import {
  expandPlanOccurrences,
  occurrenceEventId,
  occurrenceKey,
  occurrenceKeyFromEventId,
  parsePlanRecurrence,
  parseRecurrenceExceptions,
  plannerIdFromEventId,
  removeException,
  clearMovedDuration,
  hasMovedException,
  serializePlanRecurrence,
  serializeRecurrenceExceptions,
  shiftRecurrenceExceptions,
  upsertDeletedException,
  upsertMovedException,
  MAX_PLAN_OCCURRENCES,
  type PlanOccurrenceException,
  type PlanRecurrenceRule,
} from "@/utils/planRecurrence";

const PLAN_ID = "0f2a4a1c-1111-2222-3333-444455556666";
// Local wall-clock anchor: Monday 2026-06-01 09:00 local.
const ANCHOR = new Date(2026, 5, 1, 9, 0, 0, 0);
const ANCHOR_ISO = ANCHOR.toISOString();

const weekly: PlanRecurrenceRule = { freq: "weekly", interval: 1, until: null };

function expand(
  rule: PlanRecurrenceRule,
  exceptions: PlanOccurrenceException[] = [],
  windowEnd = new Date(2026, 6, 1, 0, 0, 0, 0),
) {
  return expandPlanOccurrences({
    starts: ANCHOR_ISO,
    durationMinutes: 60,
    rule,
    exceptions,
    windowEnd,
  });
}

describe("parse / serialize", () => {
  it("round-trips a rule", () => {
    const rule: PlanRecurrenceRule = { freq: "weekly", interval: 2, until: null };
    expect(parsePlanRecurrence(serializePlanRecurrence(rule))).toEqual(rule);
  });

  it("returns null for null, malformed JSON, and unknown freq", () => {
    expect(parsePlanRecurrence(null)).toBeNull();
    expect(parsePlanRecurrence("not json")).toBeNull();
    expect(parsePlanRecurrence(JSON.stringify({ freq: "yearly" }))).toBeNull();
  });

  it("normalizes bad interval and until values", () => {
    const parsed = parsePlanRecurrence(
      JSON.stringify({ freq: "daily", interval: -3, until: "garbage" }),
    );
    expect(parsed).toEqual({ freq: "daily", interval: 1, until: null });
  });

  it("round-trips exceptions and drops malformed entries", () => {
    const exceptions: PlanOccurrenceException[] = [
      { key: "2026-06-08T09:00", type: "moved", newStart: ANCHOR_ISO },
      { key: "2026-06-15T09:00", type: "deleted" },
    ];
    expect(
      parseRecurrenceExceptions(serializeRecurrenceExceptions(exceptions)),
    ).toEqual(exceptions);
    expect(parseRecurrenceExceptions(null)).toEqual([]);
    expect(
      parseRecurrenceExceptions(
        JSON.stringify([{ type: "deleted" }, { key: "x", type: "moved" }]),
      ),
    ).toEqual([]);
  });

  it("serializes an empty exception list to null", () => {
    expect(serializeRecurrenceExceptions([])).toBeNull();
  });
});

describe("occurrence ids", () => {
  it("keys occurrences by local wall-clock start", () => {
    expect(occurrenceKey(ANCHOR)).toBe("2026-06-01T09:00");
  });

  it("builds and splits composite event ids", () => {
    const id = occurrenceEventId(PLAN_ID, "2026-06-01T09:00");
    expect(plannerIdFromEventId(id)).toBe(PLAN_ID);
    expect(occurrenceKeyFromEventId(id)).toBe("2026-06-01T09:00");
  });

  it("passes plain ids through unchanged", () => {
    expect(plannerIdFromEventId(PLAN_ID)).toBe(PLAN_ID);
    expect(occurrenceKeyFromEventId(PLAN_ID)).toBeNull();
  });
});

describe("expandPlanOccurrences", () => {
  it("expands weekly occurrences up to the window end", () => {
    const occurrences = expand(weekly);
    expect(occurrences.map((o) => o.key)).toEqual([
      "2026-06-01T09:00",
      "2026-06-08T09:00",
      "2026-06-15T09:00",
      "2026-06-22T09:00",
      "2026-06-29T09:00",
    ]);
    expect(occurrences[1].start).toEqual(new Date(2026, 5, 8, 9, 0, 0, 0));
    expect(occurrences[1].end).toEqual(new Date(2026, 5, 8, 10, 0, 0, 0));
    expect(occurrences.every((o) => !o.moved)).toBe(true);
  });

  it("honors interval and monthly stepping", () => {
    const biweekly = expand({ freq: "weekly", interval: 2, until: null });
    expect(biweekly.map((o) => o.key)).toEqual([
      "2026-06-01T09:00",
      "2026-06-15T09:00",
      "2026-06-29T09:00",
    ]);

    const monthly = expand(
      { freq: "monthly", interval: 1, until: null },
      [],
      new Date(2026, 8, 15),
    );
    expect(monthly.map((o) => o.key)).toEqual([
      "2026-06-01T09:00",
      "2026-07-01T09:00",
      "2026-08-01T09:00",
      "2026-09-01T09:00",
    ]);
  });

  it("stops at the rule's until when earlier than the window", () => {
    const until = new Date(2026, 5, 16).toISOString();
    const occurrences = expand({ ...weekly, until });
    expect(occurrences.map((o) => o.key)).toEqual([
      "2026-06-01T09:00",
      "2026-06-08T09:00",
      "2026-06-15T09:00",
    ]);
  });

  it("skips deleted occurrences and repositions moved ones under the same key", () => {
    const movedTo = new Date(2026, 5, 9, 14, 0, 0, 0).toISOString();
    const occurrences = expand(weekly, [
      { key: "2026-06-08T09:00", type: "moved", newStart: movedTo },
      { key: "2026-06-15T09:00", type: "deleted" },
    ]);
    expect(occurrences.map((o) => o.key)).toEqual([
      "2026-06-01T09:00",
      "2026-06-08T09:00",
      "2026-06-22T09:00",
      "2026-06-29T09:00",
    ]);
    const moved = occurrences[1];
    expect(moved.moved).toBe(true);
    expect(moved.start.toISOString()).toBe(movedTo);
  });

  it("applies a per-occurrence duration override on a moved exception", () => {
    const movedTo = new Date(2026, 5, 8, 9, 0, 0, 0).toISOString();
    const occurrences = expand(weekly, [
      {
        key: "2026-06-08T09:00",
        type: "moved",
        newStart: movedTo,
        durationMinutes: 90,
      },
    ]);
    const overridden = occurrences.find((o) => o.key === "2026-06-08T09:00")!;
    // 90 min override, not the plan's own 60.
    expect(overridden.end.getTime() - overridden.start.getTime()).toBe(
      90 * 60000,
    );
    // Siblings keep the series duration.
    const sibling = occurrences.find((o) => o.key === "2026-06-01T09:00")!;
    expect(sibling.end.getTime() - sibling.start.getTime()).toBe(60 * 60000);
  });

  it("caps runaway expansion", () => {
    const occurrences = expand(
      { freq: "daily", interval: 1, until: null },
      [],
      new Date(2036, 0, 1),
    );
    expect(occurrences.length).toBe(MAX_PLAN_OCCURRENCES);
  });

  it("returns empty for an invalid anchor", () => {
    expect(
      expandPlanOccurrences({
        starts: "garbage",
        durationMinutes: 60,
        rule: weekly,
        exceptions: [],
        windowEnd: new Date(2026, 6, 1),
      }),
    ).toEqual([]);
  });
});

describe("exception editing", () => {
  it("upserts moved exceptions without duplicating keys", () => {
    let exceptions = upsertMovedException([], "2026-06-08T09:00", ANCHOR_ISO);
    exceptions = upsertMovedException(
      exceptions,
      "2026-06-08T09:00",
      new Date(2026, 5, 10, 9, 0).toISOString(),
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe("moved");
  });

  it("records a per-occurrence duration and preserves it across a plain re-move", () => {
    let exceptions = upsertMovedException(
      [],
      "2026-06-08T09:00",
      ANCHOR_ISO,
      45,
    );
    expect(exceptions[0]).toEqual({
      key: "2026-06-08T09:00",
      type: "moved",
      newStart: ANCHOR_ISO,
      durationMinutes: 45,
    });
    // A subsequent drag (no explicit duration) keeps the resized length.
    const movedTo = new Date(2026, 5, 10, 9, 0).toISOString();
    exceptions = upsertMovedException(exceptions, "2026-06-08T09:00", movedTo);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toEqual({
      key: "2026-06-08T09:00",
      type: "moved",
      newStart: movedTo,
      durationMinutes: 45,
    });
  });

  it("drops an invalid durationMinutes on parse", () => {
    const parsed = parseRecurrenceExceptions(
      JSON.stringify([
        {
          key: "2026-06-08T09:00",
          type: "moved",
          newStart: ANCHOR_ISO,
          durationMinutes: -5,
        },
      ]),
    );
    expect(parsed).toEqual([
      { key: "2026-06-08T09:00", type: "moved", newStart: ANCHOR_ISO },
    ]);
  });

  it("preserves a per-occurrence duration through a series shift", () => {
    const exceptions: PlanOccurrenceException[] = [
      {
        key: "2026-06-08T09:00",
        type: "moved",
        newStart: new Date(2026, 5, 8, 9, 0).toISOString(),
        durationMinutes: 75,
      },
    ];
    const shifted = shiftRecurrenceExceptions(exceptions, 24 * 60 * 60 * 1000);
    expect(shifted[0]).toMatchObject({
      key: "2026-06-09T09:00",
      type: "moved",
      durationMinutes: 75,
    });
  });

  it("replaces a moved exception with a deleted one for the same key", () => {
    let exceptions = upsertMovedException([], "2026-06-08T09:00", ANCHOR_ISO);
    exceptions = upsertDeletedException(exceptions, "2026-06-08T09:00");
    expect(exceptions).toEqual([{ key: "2026-06-08T09:00", type: "deleted" }]);
  });

  it("removes an exception by key", () => {
    const exceptions = upsertDeletedException([], "2026-06-08T09:00");
    expect(removeException(exceptions, "2026-06-08T09:00")).toEqual([]);
  });

  it("clears only the duration override, preserving a moved position", () => {
    const moved = new Date(2026, 5, 10, 9, 0).toISOString();
    const exceptions: PlanOccurrenceException[] = [
      { key: "2026-06-08T09:00", type: "moved", newStart: moved, durationMinutes: 45 },
      { key: "2026-06-15T09:00", type: "deleted" },
    ];
    const cleared = clearMovedDuration(exceptions, "2026-06-08T09:00");
    expect(cleared[0]).toEqual({
      key: "2026-06-08T09:00",
      type: "moved",
      newStart: moved,
    });
    // Untouched entries pass through unchanged.
    expect(cleared[1]).toEqual({ key: "2026-06-15T09:00", type: "deleted" });
  });

  it("detects an already-moved occurrence, ignoring deleted and unrelated keys", () => {
    const json = serializeRecurrenceExceptions([
      { key: "2026-06-08T09:00", type: "moved", newStart: ANCHOR_ISO },
      { key: "2026-06-15T09:00", type: "deleted" },
    ]);
    expect(hasMovedException(json, "2026-06-08T09:00")).toBe(true);
    // Deleted occurrences render no tile — not "customized" for prompt purposes.
    expect(hasMovedException(json, "2026-06-15T09:00")).toBe(false);
    expect(hasMovedException(json, "2026-06-22T09:00")).toBe(false);
    expect(hasMovedException(null, "2026-06-08T09:00")).toBe(false);
  });

  it("leaves exceptions untouched when the key has no duration override", () => {
    const exceptions: PlanOccurrenceException[] = [
      { key: "2026-06-08T09:00", type: "moved", newStart: ANCHOR_ISO },
    ];
    expect(clearMovedDuration(exceptions, "2026-06-08T09:00")).toEqual(
      exceptions,
    );
  });

  it("shifts keys and moved targets by a delta", () => {
    const movedTo = new Date(2026, 5, 9, 14, 0, 0, 0);
    const exceptions: PlanOccurrenceException[] = [
      { key: "2026-06-08T09:00", type: "moved", newStart: movedTo.toISOString() },
      { key: "2026-06-15T09:00", type: "deleted" },
    ];
    const dayMs = 24 * 60 * 60 * 1000;
    const shifted = shiftRecurrenceExceptions(exceptions, dayMs);
    expect(shifted[0].key).toBe("2026-06-09T09:00");
    expect(shifted[1].key).toBe("2026-06-16T09:00");
    expect(
      shifted[0].type === "moved" &&
        new Date(shifted[0].newStart).getTime() === movedTo.getTime() + dayMs,
    ).toBe(true);
  });
});
