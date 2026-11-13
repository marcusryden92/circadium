"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Check,
  GripVertical,
} from "lucide-react";

import { TaskItemProps } from "@/lib/taskItem";
import { iconBtn } from "@/lib/theme";

import TaskList from "./TaskList";
import TaskListWrapper from "./task-item-subcomponents/TaskListWrapper";
import TaskHeader from "./task-item-subcomponents/TaskHeader";
import DraggableItem from "@/components/draggable/DraggableItem";

import { getRootParentId, getSubtasksById } from "@/utils/goalPageHandlers";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import { toggleSubtaskCompletion } from "@/utils/goal-handlers/subtaskCompletion";
import { historyMessages } from "@/utils/historyMessages";
import { moveToEdge, moveToMiddle } from "@/utils/goal-handlers/moveItem";
import { sortSiblings } from "@/utils/goal-handlers/sortOrderKeys";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import useClickOutside from "@/hooks/useClickOutside";
import DragDisableListWrapper from "@/components/draggable/DragDisableListWrapper";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import { useTouchDragReorder } from "@/components/draggable/useTouchDragReorder";
import {
  itemRow,
  itemRowWithSubtasks,
  chevronBtn,
  chevronBtnFocused,
  completeBtn,
  completeCircle,
  gripBtn,
  gripWrap,
  moveMenu,
  moveMenuItem,
} from "./lumenTasks.css";

const TaskItem: React.FC<TaskItemProps> = React.memo(({ planner, task }) => {
  const [itemIsFocused, setItemIsFocused] = useState<boolean>(false);
  const [subtasksMinimized, setSubtasksMinimized] = useState<boolean>(false);
  const [shakeLocked, setShakeLocked] = useState(false);
  const { focusedTask, setFocusedTask, setCurrentlyClickedItem, moveGuard } =
    useDraggableContext();
  const { updatePlannerArray } = useCalendarProvider();

  const subtasks = getSubtasksById(planner, task.id);
  const devMode = false;
  const hasSubtasks = subtasks.length > 0;
  const isCompleted = !!task.completedEndTime;

  // Subtask completion is gated on the root item being ready, so users can't
  // start checking off work before the goal has been finalized.
  const rootId = getRootParentId(planner, task.id);
  const rootItem = rootId ? planner.find((p) => p.id === rootId) : undefined;
  const completionLocked = rootItem ? !rootItem.isReady : false;
  // A recurring goal completes per period, not per row — its leaves are checked
  // off in the "Manage completion" modal, so the inline row checkbox is hidden
  // here to avoid the inert row-level toggle.
  const rootIsRecurring = rootItem
    ? plannerHasFlexibleRecurrence(rootItem)
    : false;

  const handleToggleComplete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (completionLocked) {
        // Trigger the shake-and-red-flash animation. Re-entry while still
        // shaking is a no-op so the animation doesn't restart mid-flight.
        setShakeLocked((s) => {
          if (s) return s;
          window.setTimeout(() => setShakeLocked(false), 420);
          return true;
        });
        return;
      }
      updatePlannerArray(
        (prev) => toggleSubtaskCompletion(prev, task.id),
        task.completedEndTime
          ? historyMessages.item.uncomplete(task.title)
          : historyMessages.item.complete(task.title),
      );
    },
    [task, updatePlannerArray, completionLocked],
  );

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCurrentlyClickedItem({
        taskId: task.id,
        taskTitle: task.title,
        parentId: task.parentId || "",
      });

      // Safety net: clear click state on the next mouseup if no drop handler did.
      // Drop handlers (DraggableItem/TaskDivider) already clear, so this is a no-op
      // in the happy path; it covers releases outside any drop target.
      const onUp = () => {
        setCurrentlyClickedItem(null);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mouseup", onUp);
    },
    [task.id, task.title, task.parentId, setCurrentlyClickedItem],
  );

  // The hover-and-mouse drag system never fires on touch, so on mobile the
  // grip doubles as a touch drag handle: moving past the threshold starts a
  // drag, a plain tap opens the move menu driven by the same moveItem
  // handlers the drop targets use.
  const isMobile = useIsMobile();
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveMenuRef = useRef<HTMLSpanElement>(null);
  useClickOutside({
    ref: moveMenuRef,
    onClickOutside: () => setMoveMenuOpen(false),
    isActive: moveMenuOpen,
  });

  const closeMoveMenu = useCallback(() => setMoveMenuOpen(false), []);
  const { onGripPointerDown, consumeDragClick } = useTouchDragReorder({
    taskId: task.id,
    taskTitle: task.title,
    parentId: task.parentId ?? null,
    onDragStart: closeMoveMenu,
  });

  const siblings = moveMenuOpen
    ? sortSiblings(
        task.parentId
          ? getSubtasksById(planner, task.parentId)
          : planner.filter((t) => !t.parentId),
      )
    : [];
  const siblingIdx = siblings.findIndex((t) => t.id === task.id);
  const prevSibling = siblingIdx > 0 ? siblings[siblingIdx - 1] : null;
  const nextSibling =
    siblingIdx !== -1 && siblingIdx < siblings.length - 1
      ? siblings[siblingIdx + 1]
      : null;
  // Outdenting past the rendered tree root would promote the row to a
  // top-level goal; stop at the root's children.
  const canOutdent = !!task.parentId && task.parentId !== rootId;

  const clickedItem = {
    taskId: task.id,
    taskTitle: task.title,
    parentId: task.parentId || "",
  };
  const runMove = (e: React.MouseEvent, move: () => void) => {
    e.stopPropagation();
    move();
    setMoveMenuOpen(false);
  };

  return (
    <div
      className={`${itemRow} ${hasSubtasks ? itemRowWithSubtasks : ""}`}
    >
      <DragDisableListWrapper taskId={task.id}>
        <DraggableItem
          taskId={task.id}
          parentId={task.parentId ?? undefined}
        >
          <span className={gripWrap} ref={moveMenuRef}>
            <span
              className={gripBtn}
              onMouseDown={isMobile ? undefined : startDrag}
              onPointerDown={isMobile ? onGripPointerDown : undefined}
              onClick={
                isMobile
                  ? (e) => {
                      e.stopPropagation();
                      if (consumeDragClick()) return;
                      setMoveMenuOpen((o) => !o);
                    }
                  : undefined
              }
              aria-label={isMobile ? "Move item" : "Drag to reorder"}
              aria-expanded={isMobile ? moveMenuOpen : undefined}
              role="button"
            >
              <GripVertical size={16} strokeWidth={2} />
            </span>
            {moveMenuOpen && (
              <span className={moveMenu} role="menu">
                <button
                  type="button"
                  className={moveMenuItem}
                  disabled={!prevSibling}
                  onClick={(e) =>
                    runMove(e, () => {
                      if (!prevSibling) return;
                      moveToEdge({
                        planner,
                        updatePlannerArray,
                        currentlyClickedItem: clickedItem,
                        targetId: prevSibling.id,
                        mouseLocationInItem: "top",
                        precedence: moveGuard,
                      });
                    })
                  }
                >
                  Move up
                </button>
                <button
                  type="button"
                  className={moveMenuItem}
                  disabled={!nextSibling}
                  onClick={(e) =>
                    runMove(e, () => {
                      if (!nextSibling) return;
                      moveToEdge({
                        planner,
                        updatePlannerArray,
                        currentlyClickedItem: clickedItem,
                        targetId: nextSibling.id,
                        mouseLocationInItem: "bottom",
                        precedence: moveGuard,
                      });
                    })
                  }
                >
                  Move down
                </button>
                <button
                  type="button"
                  className={moveMenuItem}
                  disabled={!prevSibling}
                  onClick={(e) =>
                    runMove(e, () => {
                      if (!prevSibling) return;
                      moveToMiddle({
                        planner,
                        updatePlannerArray,
                        currentlyClickedItem: clickedItem,
                        currentlyHoveredItem: prevSibling.id,
                        precedence: moveGuard,
                      });
                    })
                  }
                >
                  Nest under previous
                </button>
                <button
                  type="button"
                  className={moveMenuItem}
                  disabled={!canOutdent}
                  onClick={(e) =>
                    runMove(e, () => {
                      if (!canOutdent || !task.parentId) return;
                      moveToEdge({
                        planner,
                        updatePlannerArray,
                        currentlyClickedItem: clickedItem,
                        targetId: task.parentId,
                        mouseLocationInItem: "bottom",
                        precedence: moveGuard,
                      });
                    })
                  }
                >
                  Move out one level
                </button>
              </span>
            )}
          </span>

          {hasSubtasks ? (
            <button
              type="button"
              className={`${iconBtn({ size: "sm" })} ${chevronBtn} ${itemIsFocused ? chevronBtnFocused : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setSubtasksMinimized((prev) => !prev);
              }}
              aria-label={
                subtasksMinimized ? "Expand subtasks" : "Collapse subtasks"
              }
            >
              {subtasksMinimized ? (
                <ChevronRight size={14} strokeWidth={2.4} />
              ) : (
                <ChevronDown size={14} strokeWidth={2.4} />
              )}
            </button>
          ) : rootIsRecurring ? (
            <span
              className={iconBtn({ size: "sm" })}
              aria-hidden
              style={{ pointerEvents: "none", opacity: 0 }}
            />
          ) : (
            <button
              type="button"
              className={`${iconBtn({ size: "sm" })} ${completeBtn}`}
              data-completed={isCompleted ? "true" : "false"}
              data-locked={completionLocked ? "true" : "false"}
              data-shake={shakeLocked ? "true" : "false"}
              onClick={handleToggleComplete}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
              aria-pressed={isCompleted}
              title={
                completionLocked
                  ? "Mark the goal ready before completing subtasks"
                  : undefined
              }
            >
              <span className={completeCircle} aria-hidden>
                {isCompleted && <Check size={10} strokeWidth={3} />}
              </span>
            </button>
          )}

          <TaskHeader
            task={task}
            subtasks={subtasks}
            itemIsFocused={itemIsFocused}
            setItemIsFocused={setItemIsFocused}
            focusedTask={focusedTask}
            setFocusedTask={setFocusedTask}
            devMode={devMode}
          />
        </DraggableItem>

        <TaskListWrapper
          taskId={task.id}
          subtasksLength={subtasks.length}
          parentId={task.parentId ?? undefined}
          subtasksMinimized={subtasksMinimized}
          itemIsFocused={itemIsFocused}
        >
          <TaskList id={task.id} subtasks={subtasks} />
        </TaskListWrapper>
      </DragDisableListWrapper>
    </div>
  );
});

TaskItem.displayName = "TaskItem";

export default TaskItem;
