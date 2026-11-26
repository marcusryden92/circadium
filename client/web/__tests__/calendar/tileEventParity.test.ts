/**
 * FullCalendar's CJS build requires preact, whose browser export condition
 * is ESM-only; resolve through the require condition in this file.
 * @jest-environment-options {"customExportConditions": ["require", "node", "default"]}
 */
jest.mock("../../lib/theme", () => ({
  vars: {
    accent: { primary: "A" },
    muted: "M",
    inkSoft: "I",
    status: { error: "E", warning: "W" },
  },
}));

import { Calendar } from "@fullcalendar/core";
import timeGridPlugin from "@fullcalendar/timegrid";
import { toFullCalendarInput } from "@/utils/calendar-rendering/toFullCalendarInput";
import { tileEventFromCalendarEvent } from "@/utils/calendar-rendering/tileEvent";
import { tileEventFromEventImpl } from "@/utils/calendar-rendering/fromEventImpl";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";
import { EventType } from "@/types/prisma";

// The parity seam between the two renderers: the shared tile and popover
// components must receive the same TileEvent whether it came through
// FullCalendar (CalendarEvent -> EventInput -> FullCalendar's own EventImpl ->
// shim) or straight from the view model (the own renderer's path).

const day = (h: number, m = 0) => new Date(2026, 5, 8, h, m);

const FIXTURES: CalendarEvent[] = [
  {
    kind: EventType.planner,
    id: "task-1",
    title: "Write report",
    start: day(9),
    end: day(10, 30),
    editable: true,
    color: "#3366ff",
    borderColor: "#112244",
    props: {
      id: "task-1",
      plannerType: "task",
      eventType: EventType.planner,
      completedStartTime: null,
      completedEndTime: null,
      parentId: "goal-1",
      eventId: "task-1",
      locationId: "loc-1",
    },
  },
  {
    kind: EventType.planner,
    id: "plan-1|2026-06-08T12:00",
    title: "Lunch",
    start: day(12),
    end: day(13),
    editable: true,
    color: "#aa0000",
    borderColor: "#aa0000",
    props: null,
  },
  {
    kind: EventType.template,
    id: "tmpl-1|2026-06-07T23:00",
    title: "Sleep",
    start: new Date(2026, 5, 7, 23, 0),
    end: day(7),
    editable: true,
    templateId: "tmpl-1",
    occurrenceKey: "2026-06-07T23:00",
    moved: false,
    color: "#6655aa",
  },
  {
    kind: EventType.category,
    id: "win-1|2026-06-08",
    title: "Work Time Slot",
    start: day(8),
    end: day(16),
    editable: false,
    categoryId: "category-1",
    categoryName: "Work",
    categoryColor: null,
    isStrict: true,
    trespassingStart: true,
    trespassingEnd: false,
  },
  {
    kind: EventType.travel,
    id: "home-office-2026",
    title: "Travel",
    start: day(8, 30),
    end: day(9),
    editable: false,
    fromLocationId: "home",
    toLocationId: "office",
    fromLocationName: "Home",
    toLocationName: "Office",
    travelMinutes: 30,
    requiredTravelMinutes: 40,
    insufficientTravel: true,
    overconstrained: false,
  },
  {
    kind: EventType.travel,
    id: "office-gym-2026",
    title: "Travel",
    start: day(17),
    end: day(17, 20),
    editable: false,
    fromLocationId: "office",
    toLocationId: null,
    fromLocationName: "Office",
    toLocationName: "Anywhere",
    travelMinutes: 20,
    requiredTravelMinutes: null,
    insufficientTravel: false,
    overconstrained: true,
  },
  {
    kind: EventType.external,
    id: "src-1|uid-1|2026-06-08T14:00:00.000Z",
    title: "Dentist",
    start: day(14),
    end: day(15),
    editable: false,
    sourceId: "src-1",
    uid: "uid-1",
    busy: true,
    allDay: false,
    sourceName: "Personal",
    accent: null,
  },
];

function throughFullCalendar(events: CalendarEvent[]) {
  const calendar = new Calendar(document.createElement("div"), {
    plugins: [timeGridPlugin],
    timeZone: "local",
    initialView: "timeGridWeek",
    initialDate: day(0),
    events: events.map(toFullCalendarInput),
  });
  return calendar.getEvents().map(tileEventFromEventImpl);
}

describe("TileEvent parity: EventImpl shim vs CalendarEvent path", () => {
  const viaFullCalendar = throughFullCalendar(FIXTURES);

  it("FullCalendar parsed every fixture", () => {
    expect(viaFullCalendar.map((e) => e.id)).toEqual(FIXTURES.map((e) => e.id));
  });

  it.each(FIXTURES.map((event, i) => [event.kind, event.id, i] as const))(
    "%s %s: identical props through both paths",
    (_kind, _id, i) => {
      const direct = tileEventFromCalendarEvent(FIXTURES[i]);
      const shimmed = viaFullCalendar[i];
      expect(shimmed.id).toBe(direct.id);
      expect(shimmed.title).toBe(direct.title);
      expect(shimmed.start?.getTime()).toBe(direct.start?.getTime());
      expect(shimmed.end?.getTime()).toBe(direct.end?.getTime());
      expect(shimmed.backgroundColor).toBe(direct.backgroundColor);
      expect(shimmed.borderColor).toBe(direct.borderColor);
      expect(shimmed.extendedProps).toStrictEqual(direct.extendedProps);
    },
  );

  it("external tiles carry no color of their own on either path", () => {
    const external = tileEventFromCalendarEvent(FIXTURES[6]);
    expect(external.backgroundColor).toBe("");
    expect(external.borderColor).toBe("");
    expect(external.extendedProps.externalAccent).toBe("M");
  });
});
