import { categoryEventsToCalendarEvents } from "../../../calendar-core/model/categoryEventsToCalendarEvents";
import type { CategoryEvent } from "../../../contracts";

function categoryEvent(overrides: Partial<CategoryEvent> = {}): CategoryEvent {
  return {
    id: "w1|2026-06-08",
    start: "2026-06-08T07:00:00.000Z",
    end: "2026-06-08T11:00:00.000Z",
    trespassingStart: true,
    trespassingEnd: false,
    categoryTimeWindowId: "w1",
    categoryId: "c1",
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
    ...overrides,
  };
}

const categories = [{ id: "c1", name: "Work", color: "#ff0000", isStrict: true }];

describe("categoryEventsToCalendarEvents", () => {
  it("joins the category for name, color and strict mode", () => {
    const [event] = categoryEventsToCalendarEvents([categoryEvent()], categories);
    expect(event).toEqual({
      kind: "category",
      id: "w1|2026-06-08",
      title: "Work Time Slot",
      start: new Date("2026-06-08T07:00:00.000Z"),
      end: new Date("2026-06-08T11:00:00.000Z"),
      editable: false,
      categoryId: "c1",
      categoryName: "Work",
      categoryColor: "#ff0000",
      isStrict: true,
      trespassingStart: true,
      trespassingEnd: false,
    });
  });

  it("falls back to a generic name, no color and non-strict for a missing category", () => {
    const [event] = categoryEventsToCalendarEvents(
      [categoryEvent({ categoryId: "gone" })],
      categories,
    );
    expect(event.title).toBe("Category Time Slot");
    expect(event.categoryName).toBe("Category");
    expect(event.categoryColor).toBeNull();
    expect(event.isStrict).toBe(false);
  });
});
