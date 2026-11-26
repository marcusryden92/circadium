import { act, fireEvent, render, screen } from "@testing-library/react";
import { addDays } from "date-fns";
import type { EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// Vanilla Extract only compiles in the Next build and EventTile is styled, so
// both are stubbed: this suite covers the grid's data path, snap, allow hook
// and pointer adapter wiring, not the tile chrome.
jest.mock(
  "../../components/calendar/timeGrid/timeGrid.css",
  () => new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock(
  "../../components/calendar/WeekStructureModal/WeekGrid/WeekGrid.css",
  () => new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock("../../components/calendar/WeekStructureModal/EventTile", () => {
  const { createElement } = jest.requireActual("react");
  return {
    EventTile: ({
      title,
      timeText,
      kind,
      selected,
    }: {
      title: string;
      timeText: string;
      kind: string;
      selected: boolean;
    }) =>
      createElement(
        "div",
        {
          "data-testid": `block-${kind}`,
          "data-time": timeText,
          "data-selected": String(selected),
        },
        title,
      ),
  };
});
let coarse = false;
jest.mock("../../hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => coarse,
}));

import { WeekGrid } from "@/components/calendar/WeekStructureModal/WeekGrid";
import {
  WEEK_HOUR_HEIGHT_DESKTOP,
  referenceWeekStart,
} from "@/components/calendar/WeekStructureModal/WeekGrid/weekGridModel";
import {
  templateToEvent,
  windowToEvent,
  type WeekGridEvent,
} from "@/components/calendar/WeekStructureModal/eventSerializers";
import type { WorkingWindow } from "@/components/calendar/WeekStructureModal/timeWindow";
import { CALENDAR_LONG_PRESS_DELAY_MS } from "@/utils/calendarUtils";

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

const HOUR = WEEK_HOUR_HEIGHT_DESKTOP;
const COLUMN = 100;
const WEEK_START_DAY: WeekDayIntegers = 1;
const weekStart = referenceWeekStart(WEEK_START_DAY);

beforeAll(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent =
    TestPointerEvent;
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
  coarse = false;
});

function tpl(id: string, startDay: WeekDayIntegers, startTime: string, duration: number) {
  return {
    id,
    title: id,
    startDay,
    startTime,
    duration,
    color: "#123456",
    locationId: null,
    recurrenceExceptions: null,
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
  } as unknown as EventTemplate;
}

function win(id: string, day: WeekDayIntegers, startTime: string, endTime: string): WorkingWindow {
  return { id, day, startTime, endTime, categoryId: null, recurrenceExceptions: null };
}

const point = (column: number, hours: number, pointerType = "mouse") => ({
  clientX: column * COLUMN + COLUMN / 2,
  clientY: hours * HOUR,
  button: 0,
  pointerId: 1,
  pointerType,
});

const at = (column: number, h: number, m = 0) => {
  const d = addDays(weekStart, column);
  d.setHours(h, m, 0, 0);
  return d;
};

function renderGrid(options: {
  mode: "templates" | "windows";
  templates?: EventTemplate[];
  windows?: WorkingWindow[];
}) {
  const windows = options.windows ?? [];
  const events: WeekGridEvent[] = [
    ...(options.templates ?? []).map((t) =>
      templateToEvent(t, weekStart, WEEK_START_DAY, options.mode === "templates"),
    ),
    ...windows.map((w) =>
      windowToEvent(w, weekStart, WEEK_START_DAY, new Map(), options.mode === "windows", true),
    ),
  ];
  const onSelect = jest.fn();
  const onCreate = jest.fn();
  const onEdit = jest.fn();
  render(
    <WeekGrid
      weekStartDay={WEEK_START_DAY}
      mode={options.mode}
      events={events}
      windows={windows}
      selected={null}
      dayIndex={null}
      isMobile={false}
      onSelect={onSelect}
      onCreate={onCreate}
      onEdit={onEdit}
    />,
  );
  return { onSelect, onCreate, onEdit };
}

const grid = () => document.querySelector(".columns") as HTMLElement;

describe("WeekGrid", () => {
  it("heads the columns with the abstract weekdays from weekStartDay", () => {
    renderGrid({ mode: "templates" });
    const labels = Array.from(document.querySelectorAll(".dayLabel")).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("draws a Sunday-night window in the last column and its tail in the first", () => {
    renderGrid({ mode: "windows", windows: [win("w", 0, "23:00", "07:00")] });
    const harnesses = screen
      .getAllByTestId("block-window")
      .map((b) => b.closest("[data-tile-id]")?.parentElement as HTMLElement);
    expect(harnesses.map((h) => parseFloat(h.style.top) / HOUR).sort()).toEqual([0, 23]);
  });

  it("a mouse move snaps to 15 minutes", () => {
    const { onEdit } = renderGrid({
      mode: "templates",
      templates: [tpl("t", 1, "09:00", 60)],
    });
    const block = screen.getByTestId("block-template");
    // 09:06 snaps to 09:00, 09:36 to 09:30 (a 5-minute snap would give 09:35).
    fireEvent.pointerDown(block, point(0, 9.1));
    fireEvent.pointerMove(block, point(0, 9.6));
    fireEvent.pointerUp(block, point(0, 9.6));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const [event, span, edit] = onEdit.mock.calls[0];
    expect(event.sourceId).toBe("t");
    expect(edit).toBe("move");
    expect(span.start.getTime()).toBe(at(0, 9, 30).getTime());
    expect(span.end.getTime()).toBe(at(0, 10, 30).getTime());
  });

  it("tints a window dragged onto another window and reverts the drop", () => {
    const { onEdit } = renderGrid({
      mode: "windows",
      windows: [win("a", 1, "09:00", "11:00"), win("b", 1, "13:00", "15:00")],
    });
    const [first] = screen.getAllByTestId("block-window");
    fireEvent.pointerDown(first, point(0, 10));
    fireEvent.pointerMove(first, point(0, 13));
    expect(document.querySelector(".mirrorTile[data-invalid]")).not.toBeNull();
    fireEvent.pointerUp(first, point(0, 13));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("lets a template land on another template", () => {
    const { onEdit } = renderGrid({
      mode: "templates",
      templates: [tpl("a", 1, "09:00", 60), tpl("b", 1, "12:00", 60)],
    });
    const [first] = screen.getAllByTestId("block-template");
    fireEvent.pointerDown(first, point(0, 9.5));
    fireEvent.pointerMove(first, point(0, 12.5));
    expect(document.querySelector(".mirrorTile[data-invalid]")).toBeNull();
    fireEvent.pointerUp(first, point(0, 12.5));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("draws an overnight window across columns, and refuses one over a window", () => {
    const { onCreate } = renderGrid({
      mode: "windows",
      windows: [win("w", 3, "09:00", "17:00")],
    });
    act(() => {
      fireEvent.pointerDown(grid(), point(0, 22));
      fireEvent.pointerMove(grid(), point(1, 6));
      fireEvent.pointerUp(grid(), point(1, 6));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0].start.getTime()).toBe(at(0, 22).getTime());
    expect(onCreate.mock.calls[0][0].end.getTime()).toBe(at(1, 6).getTime());

    act(() => {
      fireEvent.pointerDown(grid(), point(2, 8));
      fireEvent.pointerMove(grid(), point(2, 10));
    });
    expect(document.querySelector(".createHighlight[data-invalid]")).not.toBeNull();
    act(() => {
      fireEvent.pointerUp(grid(), point(2, 10));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("presses on blocks of the other mode fall through to drawing", () => {
    const { onCreate } = renderGrid({
      mode: "windows",
      templates: [tpl("t", 1, "09:00", 120)],
    });
    // The inactive template's harness takes no pointer events (CSS), so the
    // press reaches the grid; the adapter treats a non-editable tile as
    // not draggable.
    const harness = screen.getByTestId("block-template").closest("[data-tile-id]")
      ?.parentElement as HTMLElement;
    expect(harness.hasAttribute("data-inactive")).toBe(true);
    act(() => {
      fireEvent.pointerDown(grid(), point(0, 9));
      fireEvent.pointerMove(grid(), point(0, 10));
      fireEvent.pointerUp(grid(), point(0, 10));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("touch: a long-press drags, and released in place selects with handles", () => {
    jest.useFakeTimers();
    try {
      coarse = true;
      const { onEdit, onSelect } = renderGrid({
        mode: "templates",
        templates: [tpl("t", 1, "09:00", 60)],
      });
      const block = screen.getByTestId("block-template");
      const tile = block.closest("[data-tile-id]") as HTMLElement;
      // No handles until the tile is long-press-selected on touch.
      expect(tile.querySelector("[data-resize]")).toBeNull();

      fireEvent.pointerDown(block, point(0, 9.5, "touch"));
      act(() => {
        jest.advanceTimersByTime(CALENDAR_LONG_PRESS_DELAY_MS);
      });
      fireEvent.pointerUp(block, point(0, 9.5, "touch"));
      expect(onEdit).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith("template", "t");
      expect(tile.hasAttribute("data-tile-selected")).toBe(true);
      expect(tile.querySelectorAll("[data-resize]")).toHaveLength(2);

      // The end handle drags at once and resizes on the 15-minute grid.
      const endHandle = tile.querySelector('[data-resize="end"]') as HTMLElement;
      fireEvent.pointerDown(endHandle, point(0, 10, "touch"));
      fireEvent.pointerMove(endHandle, point(0, 11.1, "touch"));
      fireEvent.pointerUp(endHandle, point(0, 11.1, "touch"));
      expect(onEdit).toHaveBeenCalledTimes(1);
      const [, span, edit] = onEdit.mock.calls[0];
      expect(edit).toBe("resize");
      expect(span.end.getTime()).toBe(at(0, 11).getTime());

      // A long-press that moves drags the block.
      fireEvent.pointerDown(block, point(0, 9.5, "touch"));
      act(() => {
        jest.advanceTimersByTime(CALENDAR_LONG_PRESS_DELAY_MS);
      });
      fireEvent.pointerMove(block, point(2, 9.5, "touch"));
      fireEvent.pointerUp(block, point(2, 9.5, "touch"));
      expect(onEdit).toHaveBeenCalledTimes(2);
      expect(onEdit.mock.calls[1][1].start.getTime()).toBe(at(2, 9).getTime());
    } finally {
      jest.useRealTimers();
    }
  });

  it("touch: moving before the long-press fires is a scroll, not a drag", () => {
    jest.useFakeTimers();
    try {
      coarse = true;
      const { onEdit } = renderGrid({
        mode: "templates",
        templates: [tpl("t", 1, "09:00", 60)],
      });
      const block = screen.getByTestId("block-template");
      fireEvent.pointerDown(block, point(0, 9.5, "touch"));
      fireEvent.pointerMove(block, point(0, 10.5, "touch"));
      act(() => {
        jest.advanceTimersByTime(CALENDAR_LONG_PRESS_DELAY_MS);
      });
      fireEvent.pointerUp(block, point(0, 10.5, "touch"));
      expect(onEdit).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
