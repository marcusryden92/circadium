import {
  countTemplateChanges,
  diffDraftTemplates,
  groupTemplatesByDay,
} from "@/utils/draft/diffDraftTemplates";
import type { DraftTemplate } from "@/utils/draft/draftTemplates";

function template(overrides: Partial<DraftTemplate> = {}): DraftTemplate {
  return {
    id: "tpl-1",
    title: "Work",
    startDay: 1,
    startTime: "09:00",
    duration: 480,
    color: null,
    locationId: null,
    exceptions: [],
    ...overrides,
  };
}

describe("diffDraftTemplates", () => {
  it("marks added, modified with changedFields, deleted, unchanged", () => {
    const canonical = [
      template(),
      template({ id: "tpl-2", title: "Standup", startDay: 2 }),
      template({ id: "tpl-3", title: "Old habit", startDay: 3 }),
    ];
    const working = [
      template(),
      template({ id: "tpl-2", title: "Standup", startDay: 2, startTime: "09:30", duration: 15 }),
      template({ id: "tpl-new", title: "Gym", startDay: 4 }),
    ];
    const diffed = diffDraftTemplates(working, canonical);
    expect(diffed.map((t) => [t.id, t.status])).toEqual([
      ["tpl-1", "unchanged"],
      ["tpl-2", "modified"],
      ["tpl-new", "added"],
      ["tpl-3", "deleted"],
    ]);
    expect(diffed[1].changedFields).toEqual(["startTime", "duration"]);
    expect(countTemplateChanges(diffed)).toBe(3);
  });

  it("reports exception-only changes as a modified 'exceptions' field", () => {
    const canonical = [template()];
    const working = [
      template({
        exceptions: [{ key: "2026-08-10T09:00", type: "deleted" }],
      }),
    ];
    const diffed = diffDraftTemplates(working, canonical);
    expect(diffed[0].status).toBe("modified");
    expect(diffed[0].changedFields).toEqual(["exceptions"]);
  });
});

describe("groupTemplatesByDay", () => {
  it("groups Monday-first with Sunday last, sorted by startTime, empty days omitted", () => {
    const diffed = diffDraftTemplates(
      [
        template({ id: "sun", title: "Rest", startDay: 0, startTime: "10:00" }),
        template({ id: "mon-late", title: "Lunch", startDay: 1, startTime: "12:00" }),
        template({ id: "mon-early", title: "Run", startDay: 1, startTime: "06:30" }),
        template({ id: "sat", title: "Errands", startDay: 6, startTime: "09:00" }),
      ],
      [],
    );
    const groups = groupTemplatesByDay(diffed);
    expect(groups.map((g) => g.day)).toEqual([1, 6, 0]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["mon-early", "mon-late"]);
  });
});
