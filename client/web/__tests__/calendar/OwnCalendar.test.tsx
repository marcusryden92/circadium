import { act, fireEvent, render, screen } from "@testing-library/react";
import type {
  Category,
  CategoryEvent,
  EventTemplate,
  ExternalCalendarSource,
  ExternalEvent,
  SimpleEvent,
  TravelEvent,
} from "@/types/prisma";

// Vanilla Extract styles only compile inside the Next build, and the tile
// content components are themselves styled, so both are stubbed: this suite
// covers the renderer (data path, layout, routing to the right content
// component, pointer adapter), not the tile chrome.
jest.mock(
  "../../app/(protected)/calendar/_components/own/OwnCalendar.css",
  () => new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock(
  "../../components/calendar/timeGrid/timeGrid.css",
  () => new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock("../../lib/theme", () => ({
  vars: {
    accent: { primary: "A" },
    muted: "M",
    inkSoft: "I",
    status: { error: "E", warning: "W" },
  },
}));

function mockTile(kind: string) {
  const { createElement } = jest.requireActual("react");
  return ({ event }: { event: { title: string; start: Date } }) =>
    createElement(
      "div",
      { "data-testid": `tile-${kind}`, "data-start": event.start.toISOString() },
      event.title,
    );
}
jest.mock("../../components/events/EventContent", () => ({
  __esModule: true,
  default: mockTile("planner"),
}));
jest.mock("../../components/events/TemplateEventContent", () => ({
  __esModule: true,
  default: mockTile("template"),
}));
jest.mock("../../components/events/TravelEventContent", () => ({
  __esModule: true,
  default: mockTile("travel"),
}));
jest.mock("../../components/events/ExternalEventContent", () => ({
  __esModule: true,
  default: mockTile("external"),
}));
jest.mock("../../components/events/CategoryWrapperEvent", () => {
  const { createElement } = jest.requireActual("react");
  return {
    CategoryWrapperEvent: ({ categoryName }: { categoryName: string }) =>
      createElement("div", { "data-testid": "tile-category" }, categoryName),
  };
});
jest.mock("../../components/events/RecurrenceScopeModal", () => ({
  RecurrenceScopeModal: () => null,
}));
jest.mock("../../components/events/NewPlanModal", () => {
  const { createElement } = jest.requireActual("react");
  return {
    NewPlanModal: ({
      open,
      start,
      end,
    }: {
      open: boolean;
      start: Date | null;
      end: Date | null;
    }) =>
      open
        ? createElement(
            "div",
            { "data-testid": "new-plan" },
            `${start?.toISOString()}|${end?.toISOString()}`,
          )
        : null,
  };
});
jest.mock("../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
jest.mock("../../hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => false,
}));

// Monday June 8 2026, local time; the week runs Monday-first.
const at = (day: number, h = 0, m = 0) => new Date(2026, 5, day, h, m);
const iso = (d: Date) => d.toISOString();

const calendar: SimpleEvent[] = [
  {
    id: "task-1",
    title: "Write report",
    start: iso(at(8, 9)),
    end: iso(at(8, 10)),
    duration: 60,
    userId: "u",
    rrule: null,
    backgroundColor: "#111111",
    borderColor: "#222222",
    createdAt: "x",
    updatedAt: "x",
    extendedProps: null,
  },
];
const template: EventTemplate[] = [
  {
    id: "tpl-1",
    title: "Standup",
    startDay: 2,
    startTime: "10:00",
    duration: 30,
    color: null,
    locationId: null,
    recurrenceExceptions: null,
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
  },
];
const categories = [
  { id: "c1", name: "Work", color: null, isStrict: false },
] as unknown as Category[];
const categoryEvents: CategoryEvent[] = [
  {
    id: "w1|2026-06-10",
    start: iso(at(10, 8)),
    end: iso(at(10, 16)),
    trespassingStart: false,
    trespassingEnd: false,
    categoryTimeWindowId: "w1",
    categoryId: "c1",
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
  },
];
const travelEvents: TravelEvent[] = [
  {
    id: "t1",
    start: iso(at(11, 8, 30)),
    end: iso(at(11, 9)),
    fromLocationId: null,
    toLocationId: null,
    travelMinutes: 30,
    requiredTravelMinutes: null,
    insufficientTravel: false,
    overconstrained: false,
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
  },
];
const externalSources: ExternalCalendarSource[] = [
  {
    id: "src1",
    userId: "u",
    kind: "ICS",
    url: "https://example.invalid/cal.ics",
    name: "Personal",
    color: null,
    enabled: true,
    mode: "BUSY",
    modeExceptions: null,
    locationId: null,
    locationExceptions: null,
    lastError: null,
    lastFetchedAt: null,
    createdAt: "x",
    updatedAt: "x",
  },
];
const externalEvents: ExternalEvent[] = [
  {
    id: "e1",
    sourceId: "src1",
    userId: "u",
    uid: "uid1",
    title: "Dentist",
    start: iso(at(12, 14)),
    end: iso(at(12, 15)),
    allDay: false,
  },
];

const mockContext = {
  userId: "u",
  weekStartDay: 1,
  calendar,
  template,
  categories,
  categoryEvents,
  travelEvents,
  externalSources,
  externalEvents,
  planner: [],
  locations: [],
  updateTemplateArray: jest.fn(),
  updatePlannerArray: jest.fn(),
  updateAll: jest.fn(),
};
jest.mock("../../context/CalendarProvider", () => ({
  useCalendarProvider: () => mockContext,
}));

import OwnCalendar from "@/app/(protected)/calendar/_components/own/OwnCalendar";

// jsdom ships no PointerEvent; the adapter reads pointerId/pointerType off it.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

const HOUR = 76.8;
const COLUMN = 100;

beforeAll(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent =
    TestPointerEvent;
  // Seven 100px columns from the viewport origin, unscrolled.
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      left: 0,
      top: 0,
      right: 7 * COLUMN,
      bottom: 24 * HOUR,
      width: 7 * COLUMN,
      height: 24 * HOUR,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
});

beforeEach(() => {
  jest.clearAllMocks();
});

function renderCalendar() {
  return render(
    <OwnCalendar
      initialDate={at(8)}
      dayHeaderContent={({ date, isToday }) => (
        <span data-testid="day-header" data-today={isToday}>
          {date.getDate()}
        </span>
      )}
    />,
  );
}

const point = (dayIndex: number, hours: number) => ({
  clientX: dayIndex * COLUMN + COLUMN / 2,
  clientY: hours * HOUR,
  button: 0,
  buttons: 1,
  pointerId: 1,
  pointerType: "mouse",
});

describe("OwnCalendar", () => {
  it("mounts the week grid with a header per day and the hour gutter", () => {
    renderCalendar();
    expect(
      screen.getAllByTestId("day-header").map((h) => h.textContent),
    ).toEqual(["8", "9", "10", "11", "12", "13", "14"]);
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });

  it("renders a tile for each of the five event kinds through the shared content components", () => {
    renderCalendar();
    expect(screen.getByTestId("tile-planner")).toHaveTextContent("Write report");
    expect(screen.getByTestId("tile-template")).toHaveTextContent("Standup");
    expect(screen.getByTestId("tile-category")).toHaveTextContent("Work");
    expect(screen.getByTestId("tile-travel")).toBeInTheDocument();
    expect(screen.getByTestId("tile-external")).toHaveTextContent("Dentist");
  });

  it("positions a tile from the layout: top and height from hourHeight", () => {
    renderCalendar();
    const harness = screen.getByTestId("tile-planner").closest(
      "[data-tile-id]",
    )?.parentElement as HTMLElement;
    expect(parseFloat(harness.style.top)).toBeCloseTo(9 * HOUR);
    expect(parseFloat(harness.style.height)).toBeCloseTo(HOUR);
    expect(harness.style.left).toBe("0%");
    expect(harness.style.right).toBe("0%");
  });

  it("a mouse drag on a task commits through the shared start-edit apply", () => {
    renderCalendar();
    const tile = screen.getByTestId("tile-planner");
    fireEvent.pointerDown(tile, point(0, 9.25));
    fireEvent.pointerMove(tile, point(0, 10.25));
    // The mirror shows the dragged event at its new start while dragging.
    const mirrors = screen.getAllByTestId("tile-planner");
    expect(mirrors.map((m) => m.dataset.start)).toContain(iso(at(8, 10)));
    fireEvent.pointerUp(tile, point(0, 10.25));

    expect(mockContext.updatePlannerArray).toHaveBeenCalledTimes(1);
    const [update, , options] = mockContext.updatePlannerArray.mock.calls[0];
    expect(options).toEqual({ engineMode: "inline" });
    const next = update([{ id: "task-1", starts: null }]);
    expect(next[0].starts).toBe(iso(at(8, 10)));
  });

  it("a click without travel writes nothing", () => {
    renderCalendar();
    const tile = screen.getByTestId("tile-planner");
    fireEvent.pointerDown(tile, point(0, 9.25));
    fireEvent.pointerUp(tile, point(0, 9.25));
    expect(mockContext.updatePlannerArray).not.toHaveBeenCalled();
    expect(mockContext.updateAll).not.toHaveBeenCalled();
  });

  it("a press released outside the grid never turns a later hover into a drag", () => {
    renderCalendar();
    const tile = screen.getByTestId("tile-planner");
    fireEvent.pointerDown(tile, point(0, 9.25));
    // The release happened outside the grid: the next move arrives buttonless.
    fireEvent.pointerMove(tile, { ...point(0, 10.25), buttons: 0 });
    fireEvent.pointerMove(tile, { ...point(0, 11.25), buttons: 0 });
    fireEvent.pointerUp(tile, { ...point(0, 11.25), buttons: 0 });
    expect(mockContext.updatePlannerArray).not.toHaveBeenCalled();
  });

  it("dragging empty grid opens the new-plan modal on the swept range", () => {
    renderCalendar();
    const grid = document.querySelector(".columns") as HTMLElement;
    act(() => {
      fireEvent.pointerDown(grid, point(5, 13));
      fireEvent.pointerMove(grid, point(5, 14));
      fireEvent.pointerUp(grid, point(5, 14));
    });
    expect(screen.getByTestId("new-plan")).toHaveTextContent(
      `${iso(at(13, 13))}|${iso(at(13, 14))}`,
    );
  });
});
