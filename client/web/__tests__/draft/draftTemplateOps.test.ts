import {
  addDraftTemplates,
  deleteDraftTemplates,
  updateDraftTemplates,
  updateDraftTemplateExceptions,
} from "@/utils/draft/draftTemplateOps";
import {
  draftTemplatesEqual,
  normalizeDraftTemplates,
  templatesToDraft,
  type DraftTemplate,
} from "@/utils/draft/draftTemplates";
import type { EventTemplate } from "@/types/prisma";

const LOCATION_GYM = "loc-gym";
const LOCATION_WORK = "loc-work";
const VALID_LOCATIONS = new Set([LOCATION_GYM, LOCATION_WORK]);

function template(overrides: Partial<DraftTemplate> = {}): DraftTemplate {
  return {
    id: "tpl-1",
    title: "Work",
    startDay: 1,
    startTime: "09:00",
    duration: 480,
    color: "#F77F00",
    locationId: LOCATION_WORK,
    exceptions: [],
    ...overrides,
  };
}

describe("addDraftTemplates", () => {
  it("mints fresh ids and discards model-supplied ones", () => {
    const result = addDraftTemplates(
      [],
      [
        {
          id: "model-made-this-up",
          title: "Gym",
          startDay: 2,
          startTime: "18:00",
          duration: 60,
          locationId: LOCATION_GYM,
        },
      ],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(0);
    expect(result.changed).toBe(true);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].id).not.toBe("model-made-this-up");
    expect(result.templates[0].id.length).toBeGreaterThan(0);
    expect(result.templates[0].title).toBe("Gym");
    expect(result.templates[0].locationId).toBe(LOCATION_GYM);
    expect(result.templates[0].color).toBeNull();
  });

  it("collects per-row validation failures without dropping valid rows", () => {
    const result = addDraftTemplates(
      [],
      [
        { title: "", startDay: 1, startTime: "09:00", duration: 60 },
        { title: "Bad day", startDay: 7, startTime: "09:00", duration: 60 },
        { title: "Bad time", startDay: 1, startTime: "24:00", duration: 60 },
        { title: "Bad duration", startDay: 1, startTime: "09:00", duration: 999999 },
        { title: "Bad color", startDay: 1, startTime: "09:00", duration: 60, color: "red" },
        { title: "Bad location", startDay: 1, startTime: "09:00", duration: 60, locationId: "nope" },
        { title: "Sleep", startDay: 0, startTime: "23:00", duration: 480 },
      ],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(6);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].title).toBe("Sleep");
  });

  it("floors sub-minute durations up to 1", () => {
    const result = addDraftTemplates(
      [],
      [{ title: "Blink", startDay: 3, startTime: "12:00", duration: 0.4 }],
      VALID_LOCATIONS,
    );
    expect(result.templates[0].duration).toBe(1);
  });

  it("does not mutate the input array", () => {
    const existing = [template()];
    addDraftTemplates(
      existing,
      [{ title: "Gym", startDay: 2, startTime: "18:00", duration: 60 }],
      VALID_LOCATIONS,
    );
    expect(existing).toEqual([template()]);
  });
});

describe("updateDraftTemplates", () => {
  it("applies partial patches and reports change", () => {
    const result = updateDraftTemplates(
      [template()],
      [{ id: "tpl-1", startTime: "10:00", duration: 420 }],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(0);
    expect(result.changed).toBe(true);
    expect(result.templates[0]).toMatchObject({
      startTime: "10:00",
      duration: 420,
      title: "Work",
    });
  });

  it("null clears color and locationId", () => {
    const result = updateDraftTemplates(
      [template()],
      [{ id: "tpl-1", color: null, locationId: null }],
      VALID_LOCATIONS,
    );
    expect(result.templates[0].color).toBeNull();
    expect(result.templates[0].locationId).toBeNull();
  });

  it("fails on unknown id and unknown locationId", () => {
    const result = updateDraftTemplates(
      [template()],
      [
        { id: "ghost", title: "Nope" },
        { id: "tpl-1", locationId: "nowhere" },
      ],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(2);
    expect(result.templates[0].locationId).toBe(LOCATION_WORK);
  });

  it("does not mutate the input array", () => {
    const existing = [template()];
    updateDraftTemplates(
      existing,
      [{ id: "tpl-1", title: "Changed" }],
      VALID_LOCATIONS,
    );
    expect(existing[0].title).toBe("Work");
  });
});

describe("updateDraftTemplateExceptions", () => {
  // tpl-1 runs Mondays 09:00; 2026-08-10 is a Monday, 2026-08-12 a Wednesday.
  it("skips and moves dated occurrences, minting keys from the start time", () => {
    const result = updateDraftTemplateExceptions(
      [template()],
      [
        {
          templateId: "tpl-1",
          skip: ["2026-08-10"],
          move: [
            {
              date: "2026-08-17",
              newStart: "2026-08-18T01:30",
              durationMinutes: 420,
            },
          ],
        },
      ],
    );
    expect(result.failures).toHaveLength(0);
    expect(result.changed).toBe(true);
    expect(result.templates[0].exceptions).toEqual(
      expect.arrayContaining([
        { key: "2026-08-10T09:00", type: "deleted" },
        {
          key: "2026-08-17T09:00",
          type: "moved",
          newStart: "2026-08-18T01:30",
          durationMinutes: 420,
        },
      ]),
    );
  });

  it("refuses dates that miss the template's weekday, with day names", () => {
    const result = updateDraftTemplateExceptions(
      [template()],
      [{ templateId: "tpl-1", skip: ["2026-08-12"] }],
    );
    expect(result.changed).toBe(false);
    expect(result.failures[0].reason).toContain("Wednesday");
    expect(result.failures[0].reason).toContain("Monday");
  });

  it("restores an existing exception and refuses restoring a clean date", () => {
    const withSkip = template({
      exceptions: [{ key: "2026-08-10T09:00", type: "deleted" }],
    });
    const restored = updateDraftTemplateExceptions(
      [withSkip],
      [{ templateId: "tpl-1", restore: ["2026-08-10"] }],
    );
    expect(restored.templates[0].exceptions).toEqual([]);
    expect(restored.changed).toBe(true);

    const clean = updateDraftTemplateExceptions(
      [template()],
      [{ templateId: "tpl-1", restore: ["2026-08-10"] }],
    );
    expect(clean.changed).toBe(false);
    expect(clean.failures[0].reason).toContain("no exception");
  });

  it("truncates seconds in newStart but refuses timezone suffixes", () => {
    const withSeconds = updateDraftTemplateExceptions(
      [template()],
      [
        {
          templateId: "tpl-1",
          move: [{ date: "2026-08-10", newStart: "2026-08-11T01:30:00" }],
        },
      ],
    );
    expect(withSeconds.failures).toHaveLength(0);
    expect(withSeconds.templates[0].exceptions).toEqual([
      { key: "2026-08-10T09:00", type: "moved", newStart: "2026-08-11T01:30" },
    ]);

    const withZone = updateDraftTemplateExceptions(
      [template()],
      [
        {
          templateId: "tpl-1",
          move: [{ date: "2026-08-10", newStart: "2026-08-11T01:30:00Z" }],
        },
      ],
    );
    expect(withZone.changed).toBe(false);
    expect(withZone.failures[0].reason).toContain("no timezone suffix");
  });

  it("validates newStart shape and durationMinutes bounds", () => {
    const result = updateDraftTemplateExceptions(
      [template()],
      [
        {
          templateId: "tpl-1",
          move: [
            { date: "2026-08-10", newStart: "tomorrow-ish" },
            {
              date: "2026-08-17",
              newStart: "2026-08-17T10:00",
              durationMinutes: 0,
            },
          ],
        },
      ],
    );
    expect(result.changed).toBe(false);
    expect(result.failures).toHaveLength(2);
  });

  it("fails on unknown template id without touching others", () => {
    const result = updateDraftTemplateExceptions(
      [template()],
      [{ templateId: "ghost", skip: ["2026-08-10"] }],
    );
    expect(result.changed).toBe(false);
    expect(result.failures[0].reason).toBe("template not found");
  });
});

describe("updateDraftTemplates exception clearing", () => {
  it("clears exceptions when the series is re-anchored, keeps them otherwise", () => {
    const withSkip = template({
      exceptions: [{ key: "2026-08-10T09:00", type: "deleted" }],
    });
    const retimed = updateDraftTemplates(
      [withSkip],
      [{ id: "tpl-1", startTime: "10:00" }],
      VALID_LOCATIONS,
    );
    expect(retimed.templates[0].exceptions).toEqual([]);

    const renamed = updateDraftTemplates(
      [withSkip],
      [{ id: "tpl-1", title: "Deep work" }],
      VALID_LOCATIONS,
    );
    expect(renamed.templates[0].exceptions).toHaveLength(1);
  });
});

describe("deleteDraftTemplates", () => {
  it("removes rows, dedupes ids, and reports unknown ids", () => {
    const result = deleteDraftTemplates(
      [template(), template({ id: "tpl-2", title: "Gym" })],
      ["tpl-2", "tpl-2", "ghost"],
    );
    expect(result.changed).toBe(true);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].id).toBe("tpl-1");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe("ghost");
  });

  it("reports no change when nothing matched", () => {
    const result = deleteDraftTemplates([template()], ["ghost"]);
    expect(result.changed).toBe(false);
    expect(result.templates).toHaveLength(1);
  });
});

describe("draftTemplatesEqual", () => {
  it("is order-insensitive", () => {
    const a = [template(), template({ id: "tpl-2", title: "Gym" })];
    const b = [template({ id: "tpl-2", title: "Gym" }), template()];
    expect(draftTemplatesEqual(a, b)).toBe(true);
  });

  it("detects field changes and membership changes", () => {
    expect(
      draftTemplatesEqual([template()], [template({ startTime: "09:30" })]),
    ).toBe(false);
    expect(draftTemplatesEqual([template()], [])).toBe(false);
    expect(
      draftTemplatesEqual([template()], [template({ id: "other" })]),
    ).toBe(false);
  });
});

describe("templatesToDraft / normalizeDraftTemplates", () => {
  it("strips server fields and normalizes optionals", () => {
    const row = {
      id: "tpl-1",
      title: "Work",
      startDay: 1,
      startTime: "09:00",
      duration: 480,
      color: null,
      locationId: null,
      userId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as EventTemplate;
    expect(templatesToDraft([row])).toEqual([
      {
        id: "tpl-1",
        title: "Work",
        startDay: 1,
        startTime: "09:00",
        duration: 480,
        color: null,
        locationId: null,
        exceptions: [],
      },
    ]);
  });

  it("drops malformed rows from SSE payloads", () => {
    const normalized = normalizeDraftTemplates({
      templates: [
        template(),
        { id: "", title: "no id", startDay: 1, startTime: "09:00", duration: 60 },
        { id: "x", title: "bad time", startDay: 1, startTime: "9am", duration: 60 },
        "not an object",
      ],
    });
    expect(normalized).toHaveLength(1);
    expect(normalized?.[0].id).toBe("tpl-1");
  });

  it("returns null for a payload without a templates array", () => {
    expect(normalizeDraftTemplates({})).toBeNull();
    expect(normalizeDraftTemplates(null)).toBeNull();
  });
});
