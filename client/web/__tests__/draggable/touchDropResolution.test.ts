import type { Planner } from "@/types/prisma";
import {
  resolveTouchDropTarget,
  TOP_BAND,
  BOTTOM_BAND,
} from "@/components/draggable/touchDropResolution";

const TS = "2026-01-01T00:00:00.000Z";

function row(overrides: Partial<Planner> & { id: string }): Planner {
  return {
    title: overrides.id,
    parentId: null,
    plannerType: "task",
    isReady: null,
    isTriaged: true,
    duration: 30,
    deadline: null,
    starts: null,
    recurrence: null,
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 0,
    userId: "test-user",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

// goal
// ├─ a (a1, a2)
// ├─ b
// └─ c
const planner: Planner[] = [
  row({ id: "goal", plannerType: "goal", sortOrder: 1024 }),
  row({ id: "a", parentId: "goal", sortOrder: 1024 }),
  row({ id: "a1", parentId: "a", sortOrder: 1024 }),
  row({ id: "a2", parentId: "a", sortOrder: 2048 }),
  row({ id: "b", parentId: "goal", sortOrder: 2048 }),
  row({ id: "c", parentId: "goal", sortOrder: 3072 }),
];

const ROW_TOP = 100;
const ROW_HEIGHT = 30;

function resolve(overrides: {
  draggedId?: string;
  draggedParentId?: string | null;
  rowTaskId: string;
  clientY: number;
  childrenExpanded?: boolean;
}) {
  return resolveTouchDropTarget({
    planner,
    draggedId: overrides.draggedId ?? "c",
    draggedParentId: overrides.draggedParentId ?? "goal",
    rowTaskId: overrides.rowTaskId,
    rowTop: ROW_TOP,
    rowHeight: ROW_HEIGHT,
    clientY: overrides.clientY,
    childrenExpanded: overrides.childrenExpanded ?? false,
  });
}

describe("resolveTouchDropTarget", () => {
  it("maps the top band to the row's own top divider", () => {
    expect(resolve({ rowTaskId: "b", clientY: ROW_TOP })).toEqual({
      taskId: "b",
      kind: "top",
    });
    expect(
      resolve({ rowTaskId: "b", clientY: ROW_TOP + ROW_HEIGHT * TOP_BAND - 1 }),
    ).toEqual({ taskId: "b", kind: "top" });
  });

  it("maps the middle band to nest, starting exactly at the band boundary", () => {
    expect(
      resolve({ rowTaskId: "b", clientY: ROW_TOP + ROW_HEIGHT * TOP_BAND }),
    ).toEqual({ taskId: "b", kind: "nest" });
    expect(
      resolve({
        rowTaskId: "b",
        clientY: ROW_TOP + ROW_HEIGHT * BOTTOM_BAND - 1,
      }),
    ).toEqual({ taskId: "b", kind: "nest" });
  });

  it("starts the bottom band exactly at its boundary", () => {
    expect(
      resolve({ rowTaskId: "b", clientY: ROW_TOP + ROW_HEIGHT * BOTTOM_BAND }),
    ).toEqual({ taskId: "c", kind: "top" });
  });

  it("maps a non-last row's bottom band to the next sibling's top divider", () => {
    expect(
      resolve({
        draggedId: "a1",
        draggedParentId: "a",
        rowTaskId: "a",
        clientY: ROW_TOP + ROW_HEIGHT - 1,
      }),
    ).toEqual({ taskId: "b", kind: "top" });
  });

  it("maps the last sibling's bottom band to the trailing bottom divider", () => {
    expect(
      resolve({
        draggedId: "a",
        rowTaskId: "c",
        clientY: ROW_TOP + ROW_HEIGHT - 1,
      }),
    ).toEqual({ taskId: "c", kind: "bottom" });
  });

  it("maps an expanded parent's bottom band to its first child's top divider", () => {
    expect(
      resolve({
        rowTaskId: "a",
        clientY: ROW_TOP + ROW_HEIGHT - 1,
        childrenExpanded: true,
      }),
    ).toEqual({ taskId: "a1", kind: "top" });
  });

  it("ignores childrenExpanded on collapsed subtrees", () => {
    expect(
      resolve({
        rowTaskId: "a",
        clientY: ROW_TOP + ROW_HEIGHT - 1,
        childrenExpanded: false,
      }),
    ).toEqual({ taskId: "b", kind: "top" });
  });

  it("rejects nesting into the dragged item's own parent", () => {
    expect(
      resolve({
        draggedId: "a1",
        draggedParentId: "a",
        rowTaskId: "a",
        clientY: ROW_TOP + ROW_HEIGHT / 2,
      }),
    ).toBeNull();
  });

  it("rejects the dragged row itself and rows inside the dragged subtree", () => {
    expect(
      resolve({
        draggedId: "a",
        rowTaskId: "a",
        clientY: ROW_TOP + ROW_HEIGHT / 2,
      }),
    ).toBeNull();
    expect(
      resolve({
        draggedId: "a",
        rowTaskId: "a2",
        clientY: ROW_TOP + ROW_HEIGHT / 2,
      }),
    ).toBeNull();
  });

  it("returns null for unknown rows and zero-height rects", () => {
    expect(
      resolve({ rowTaskId: "missing", clientY: ROW_TOP + 1 }),
    ).toBeNull();
    expect(
      resolveTouchDropTarget({
        planner,
        draggedId: "c",
        draggedParentId: "goal",
        rowTaskId: "b",
        rowTop: ROW_TOP,
        rowHeight: 0,
        clientY: ROW_TOP,
        childrenExpanded: false,
      }),
    ).toBeNull();
  });
});
