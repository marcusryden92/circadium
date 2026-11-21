import { Planner } from "@/types/prisma";
import { getSubtasksById, getTaskTreeIds } from "@/utils/goalPageHandlers";
import { sortSiblings } from "@/utils/goal-handlers/sortOrderKeys";

export type TouchDropTarget = {
  taskId: string;
  kind: "top" | "bottom" | "nest";
} | null;

export const TOP_BAND = 0.3;
export const BOTTOM_BAND = 0.7;

interface ResolveTouchDropTargetProps {
  planner: Planner[];
  draggedId: string;
  draggedParentId: string | null;
  rowTaskId: string;
  rowTop: number;
  rowHeight: number;
  clientY: number;
  childrenExpanded: boolean;
}

// Maps a finger position over a row to the drop target a mouse user would
// reach through hover: top band = the divider above the row, middle = nest
// into the row, bottom band = whichever divider the DOM actually renders
// below the row (an expanded parent's first-child divider, the next
// sibling's top divider, or the group's trailing bottom divider).
export function resolveTouchDropTarget({
  planner,
  draggedId,
  draggedParentId,
  rowTaskId,
  rowTop,
  rowHeight,
  clientY,
  childrenExpanded,
}: ResolveTouchDropTargetProps): TouchDropTarget {
  if (rowTaskId === draggedId || rowHeight <= 0) return null;
  if (getTaskTreeIds(planner, draggedId).includes(rowTaskId)) return null;

  const row = planner.find((t) => t.id === rowTaskId);
  if (!row) return null;

  const ratio = (clientY - rowTop) / rowHeight;

  if (ratio < TOP_BAND) return { taskId: rowTaskId, kind: "top" };

  if (ratio < BOTTOM_BAND) {
    if (rowTaskId === draggedParentId) return null;
    return { taskId: rowTaskId, kind: "nest" };
  }

  if (childrenExpanded) {
    const firstChild = sortSiblings(getSubtasksById(planner, rowTaskId))[0];
    if (firstChild) return { taskId: firstChild.id, kind: "top" };
  }

  const siblingPool = row.parentId
    ? getSubtasksById(planner, row.parentId)
    : planner.filter((t) => !t.parentId);
  const siblings = sortSiblings(siblingPool);
  const index = siblings.findIndex((t) => t.id === rowTaskId);
  const nextSibling =
    index !== -1 && index < siblings.length - 1 ? siblings[index + 1] : null;

  return nextSibling
    ? { taskId: nextSibling.id, kind: "top" }
    : { taskId: rowTaskId, kind: "bottom" };
}
