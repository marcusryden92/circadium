import type { WorkingWindow } from "@/components/calendar/WeekStructureModal/timeWindow";
import { windowToEvent } from "@/components/calendar/WeekStructureModal/eventSerializers";
import type { Category } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// 2024-01-07 is a Sunday; the windowToEvent rendering is checked against a
// Monday-start week below. windowRangeOverlaps' own cases live in the shared
// calendar-core suite.
const WEEK_SUNDAY = new Date(2024, 0, 7);

function win(
  day: WeekDayIntegers,
  startTime: string,
  endTime: string,
  id = `w-${day}-${startTime}`,
): WorkingWindow {
  return { id, day, startTime, endTime, categoryId: "c1", recurrenceExceptions: null };
}

describe("windowToEvent overnight rendering", () => {
  const category: Category = {
    id: "c1",
    name: "Focus",
    icon: null,
    color: "#3b82f6",
    sortOrder: 0,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    locationId: null,
    parentId: null,
    userId: "u1",
    timeSlots: [],
    createdAt: WEEK_SUNDAY.toISOString(),
    updatedAt: WEEK_SUNDAY.toISOString(),
  };
  const categoryById = new Map([[category.id, category]]);
  // Week starting Monday (weekStartDay 1), reference Monday 2024-01-08.
  const weekStart = new Date(2024, 0, 8);
  const weekStartDay: WeekDayIntegers = 1;

  it("renders an overnight window ending on the following day", () => {
    const event = windowToEvent(
      win(1, "23:00", "07:00"),
      weekStart,
      weekStartDay,
      categoryById,
      true,
      true,
    );
    const start = event.start;
    const end = event.end;
    expect(start.getHours()).toBe(23);
    expect(end.getDate()).toBe(start.getDate() + 1);
    expect(end.getHours()).toBe(7);
    // Eight hours, not a negative-duration event.
    expect((end.getTime() - start.getTime()) / 3600000).toBe(8);
  });

  it("renders a within-day window inside a single day", () => {
    const event = windowToEvent(
      win(1, "09:00", "17:00"),
      weekStart,
      weekStartDay,
      categoryById,
      true,
      true,
    );
    const start = event.start;
    const end = event.end;
    expect(end.getDate()).toBe(start.getDate());
    expect((end.getTime() - start.getTime()) / 3600000).toBe(8);
  });
});
