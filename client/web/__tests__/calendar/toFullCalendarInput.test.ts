jest.mock("../../lib/theme", () => ({
  vars: {
    accent: { primary: "A" },
    muted: "M",
    inkSoft: "I",
    status: { error: "E", warning: "W" },
  },
}));

import { toFullCalendarInput } from "@/utils/calendar-rendering/toFullCalendarInput";
import type {
  CategoryCalendarEvent,
  ExternalCalendarEvent,
  PlannerCalendarEvent,
  TemplateCalendarEvent,
  TravelCalendarEvent,
} from "@circadium/shared/calendar-core/model";
import { EventType } from "@/types/prisma";

// The expected objects are the EventInput the FullCalendar builders produced
// before the view model existed (start/end aside, which are now Dates), so a
// change here is a change to what FullCalendar receives.

const start = new Date(2026, 5, 8, 7, 0);
const end = new Date(2026, 5, 8, 8, 0);
const base = { title: "T", start, end };

const NULL_PLANNER_FIELDS = {
  plannerType: null,
  completedStartTime: null,
  completedEndTime: null,
  parentId: null,
};

describe("toFullCalendarInput", () => {
  it("planner: props spread verbatim plus the duplicated backgroundColor", () => {
    const event: PlannerCalendarEvent = {
      ...base,
      kind: EventType.planner,
      id: "s1",
      editable: true,
      color: "#111",
      borderColor: "#222",
      props: {
        id: "x",
        plannerType: "task",
        eventType: EventType.planner,
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
        eventId: "s1",
        locationId: "l1",
      },
    };
    expect(toFullCalendarInput(event)).toStrictEqual({
      id: "s1",
      title: "T",
      start,
      end,
      backgroundColor: "#111",
      borderColor: "#222",
      editable: true,
      extendedProps: {
        id: "x",
        plannerType: "task",
        eventType: "planner",
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
        eventId: "s1",
        locationId: "l1",
        backgroundColor: "#111",
      },
    });
  });

  it("planner: null props give only the backgroundColor, no injected eventType", () => {
    const event: PlannerCalendarEvent = {
      ...base,
      kind: EventType.planner,
      id: "s2",
      editable: true,
      color: "#333",
      borderColor: "#444",
      props: null,
    };
    expect(toFullCalendarInput(event)).toStrictEqual({
      id: "s2",
      title: "T",
      start,
      end,
      backgroundColor: "#333",
      borderColor: "#444",
      editable: true,
      extendedProps: { backgroundColor: "#333" },
    });
  });

  it("template: composite id, transparent border, row id in eventId", () => {
    const event: TemplateCalendarEvent = {
      ...base,
      kind: EventType.template,
      id: "tpl-1|2026-06-08T07:00",
      editable: true,
      templateId: "tpl-1",
      occurrenceKey: "2026-06-08T07:00",
      moved: false,
      color: "#123456",
    };
    expect(toFullCalendarInput(event)).toStrictEqual({
      id: "tpl-1|2026-06-08T07:00",
      title: "T",
      start,
      end,
      backgroundColor: "#123456",
      borderColor: "transparent",
      editable: true,
      extendedProps: {
        eventType: "template",
        ...NULL_PLANNER_FIELDS,
        isTemplateItem: true,
        eventId: "tpl-1",
      },
    });
  });

  it("category: background display, accent fallback when uncolored", () => {
    const colored: CategoryCalendarEvent = {
      ...base,
      title: "Work Time Slot",
      kind: EventType.category,
      id: "ce1",
      editable: false,
      categoryId: "c1",
      categoryName: "Work",
      categoryColor: "#f00",
      isStrict: true,
      trespassingStart: true,
      trespassingEnd: false,
    };
    expect(toFullCalendarInput(colored)).toStrictEqual({
      id: "ce1",
      title: "Work Time Slot",
      start,
      end,
      backgroundColor: "#f00",
      borderColor: "#f00",
      display: "background",
      editable: false,
      extendedProps: {
        eventType: "category",
        eventId: "",
        ...NULL_PLANNER_FIELDS,
        categoryId: "c1",
        categoryName: "Work",
        categoryColor: "#f00",
        isStrict: true,
        wrapperId: "ce1",
        trespassingStart: true,
        trespassingEnd: false,
      },
    });

    const uncolored = toFullCalendarInput({
      ...colored,
      categoryColor: null,
    });
    expect(uncolored.backgroundColor).toBe("A");
    expect(uncolored.borderColor).toBe("A");
    expect(uncolored.extendedProps?.categoryColor).toBeNull();
  });

  it("travel: colors follow the insufficient / overconstrained flags", () => {
    const event: TravelCalendarEvent = {
      ...base,
      title: "Home → Anywhere",
      kind: EventType.travel,
      id: "t1",
      editable: false,
      fromLocationId: "l1",
      toLocationId: null,
      fromLocationName: "Home",
      toLocationName: "Anywhere",
      travelMinutes: 10,
      requiredTravelMinutes: null,
      insufficientTravel: false,
      overconstrained: false,
    };
    expect(toFullCalendarInput(event)).toStrictEqual({
      id: "t1",
      title: "Home → Anywhere",
      start,
      end,
      backgroundColor: "M",
      borderColor: "I",
      editable: false,
      extendedProps: {
        eventType: "travel",
        eventId: "t1",
        ...NULL_PLANNER_FIELDS,
        fromLocationId: "l1",
        toLocationId: null,
        fromLocationName: "Home",
        toLocationName: "Anywhere",
        travelMinutes: 10,
        insufficientTravel: false,
        overconstrained: false,
        requiredTravelMinutes: null,
      },
    });

    const insufficient = toFullCalendarInput({
      ...event,
      insufficientTravel: true,
      overconstrained: true,
    });
    expect([insufficient.backgroundColor, insufficient.borderColor]).toEqual([
      "E",
      "E",
    ]);
    const overconstrained = toFullCalendarInput({
      ...event,
      overconstrained: true,
    });
    expect([
      overconstrained.backgroundColor,
      overconstrained.borderColor,
    ]).toEqual(["W", "W"]);
  });

  it("external: no backgroundColor, resize locked, muted accent fallback", () => {
    const event: ExternalCalendarEvent = {
      ...base,
      kind: EventType.external,
      id: "e1",
      editable: false,
      sourceId: "src1",
      uid: "uid1",
      busy: true,
      allDay: false,
      sourceName: "Work cal",
      accent: "#0f0",
    };
    expect(toFullCalendarInput(event)).toStrictEqual({
      id: "e1",
      title: "T",
      start,
      end,
      editable: false,
      durationEditable: false,
      extendedProps: {
        eventType: "external",
        eventId: "e1",
        ...NULL_PLANNER_FIELDS,
        externalSourceId: "src1",
        externalUid: "uid1",
        externalBusy: true,
        externalAllDay: false,
        externalSourceName: "Work cal",
        externalAccent: "#0f0",
      },
    });

    expect(
      toFullCalendarInput({ ...event, accent: null }).extendedProps
        ?.externalAccent,
    ).toBe("M");
  });
});
