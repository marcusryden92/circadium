import { applyDraftTemplates } from "@/utils/draft/applyDraftTemplates";
import { templatesToDraft } from "@/utils/draft/draftTemplates";
import type { EventTemplate } from "@/types/prisma";

const USER = "user-1";
const OPENED_AT = "2026-07-01T10:00:00.000Z";
const SAVED_AT = "2026-07-04T12:00:00.000Z";

function row(overrides: Partial<EventTemplate> = {}): EventTemplate {
  return {
    id: "tpl-1",
    title: "Work",
    startDay: 1,
    startTime: "09:00",
    duration: 480,
    color: "#F77F00",
    locationId: "loc-work",
    userId: USER,
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
    ...overrides,
  } as EventTemplate;
}

describe("applyDraftTemplates", () => {
  it("returns untouched rows by object identity (no updatedAt churn)", () => {
    const current = [row()];
    const canonical = templatesToDraft(current);
    const result = applyDraftTemplates({
      current,
      canonical,
      working: templatesToDraft(current),
      userId: USER,
      now: SAVED_AT,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(current[0]);
  });

  it("restamps updatedAt on changed rows and keeps other fields", () => {
    const current = [row()];
    const canonical = templatesToDraft(current);
    const working = templatesToDraft(current);
    working[0] = { ...working[0], startTime: "10:00", locationId: null };
    const result = applyDraftTemplates({
      current,
      canonical,
      working,
      userId: USER,
      now: SAVED_AT,
    });
    expect(result[0]).not.toBe(current[0]);
    expect(result[0]).toMatchObject({
      id: "tpl-1",
      startTime: "10:00",
      locationId: null,
      title: "Work",
      updatedAt: SAVED_AT,
      createdAt: OPENED_AT,
    });
  });

  it("creates new rows keeping the draft uuid and attaching server fields", () => {
    const result = applyDraftTemplates({
      current: [],
      canonical: [],
      working: [
        {
          id: "draft-uuid",
          title: "Gym",
          startDay: 2,
          startTime: "18:00",
          duration: 60,
          color: null,
          locationId: "loc-gym",
          exceptions: [],
        },
      ],
      userId: USER,
      now: SAVED_AT,
    });
    expect(result).toEqual([
      {
        id: "draft-uuid",
        title: "Gym",
        startDay: 2,
        startTime: "18:00",
        duration: 60,
        color: null,
        locationId: "loc-gym",
        recurrenceExceptions: null,
        userId: USER,
        createdAt: SAVED_AT,
        updatedAt: SAVED_AT,
      },
    ]);
  });

  it("deletes rows removed from the working set", () => {
    const current = [row(), row({ id: "tpl-2", title: "Standup" })];
    const canonical = templatesToDraft(current);
    const working = templatesToDraft([current[0]]);
    const result = applyDraftTemplates({
      current,
      canonical,
      working,
      userId: USER,
      now: SAVED_AT,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(current[0]);
  });

  it("clears recurrenceExceptions when an update re-anchors the series day/time", () => {
    const exceptions = JSON.stringify([
      { key: "2026-07-06T09:00", type: "deleted" },
    ]);
    const current = [row({ recurrenceExceptions: exceptions })];
    const canonical = templatesToDraft(current);
    const working = templatesToDraft(current);
    working[0] = { ...working[0], startDay: 3 };
    const result = applyDraftTemplates({
      current,
      canonical,
      working,
      userId: USER,
      now: SAVED_AT,
    });
    expect(result[0].recurrenceExceptions).toBeNull();
  });

  it("preserves recurrenceExceptions when an update touches only other fields", () => {
    const exceptions = JSON.stringify([
      { key: "2026-07-06T09:00", type: "deleted" },
    ]);
    const current = [row({ recurrenceExceptions: exceptions })];
    const canonical = templatesToDraft(current);
    const working = templatesToDraft(current);
    working[0] = { ...working[0], title: "Deep work" };
    const result = applyDraftTemplates({
      current,
      canonical,
      working,
      userId: USER,
      now: SAVED_AT,
    });
    expect(result[0].recurrenceExceptions).toBe(exceptions);
  });

  it("writes assistant-edited exceptions, restamping updatedAt", () => {
    const current = [row()];
    const canonical = templatesToDraft(current);
    const working = templatesToDraft(current);
    working[0] = {
      ...working[0],
      exceptions: [{ key: "2026-08-10T09:00", type: "deleted" }],
    };
    const result = applyDraftTemplates({
      current,
      canonical,
      working,
      userId: USER,
      now: SAVED_AT,
    });
    expect(result[0]).not.toBe(current[0]);
    expect(result[0].updatedAt).toBe(SAVED_AT);
    expect(JSON.parse(result[0].recurrenceExceptions ?? "[]")).toEqual([
      { key: "2026-08-10T09:00", type: "deleted" },
    ]);
  });

  it("keeps a calendar-made exception the assistant never touched", () => {
    const opened = [row()];
    const canonical = templatesToDraft(opened);
    const working = templatesToDraft(opened);
    working[0] = { ...working[0], title: "Deep work" };
    const concurrentExceptions = JSON.stringify([
      { key: "2026-08-10T09:00", type: "deleted" },
    ]);
    const current = [row({ recurrenceExceptions: concurrentExceptions })];
    const result = applyDraftTemplates({
      current,
      canonical,
      working,
      userId: USER,
      now: SAVED_AT,
    });
    expect(result[0].title).toBe("Deep work");
    expect(result[0].recurrenceExceptions).toBe(concurrentExceptions);
  });

  it("preserves rows created elsewhere while the modal was open", () => {
    const opened = [row()];
    const concurrent = row({ id: "tpl-elsewhere", title: "New in other tab" });
    const current = [...opened, concurrent];
    const result = applyDraftTemplates({
      current,
      canonical: templatesToDraft(opened),
      working: templatesToDraft(opened),
      userId: USER,
      now: SAVED_AT,
    });
    expect(result).toHaveLength(2);
    expect(result).toContain(concurrent);
  });
});
