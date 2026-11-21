"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TaskList from "@/components/tasks/TaskList";
import RootTaskListWrapper from "@/components/tasks/task-item-subcomponents/RootTaskListWrapper";
import AddSubtask from "@/components/tasks/task-item-subcomponents/AddSubtask";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { BottomSheet } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { getRootParentId } from "@/utils/goalPageHandlers";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import { useItem } from "../_components/ItemContext";
import { EditDrawer } from "./_components/EditDrawer";
import { RecurringGoalCompletionBar } from "../_components/RecurringCompletion";
import {
  layout,
  treePane,
  drawerSlot,
  drawerSlotOpen,
  drawerSheetFill,
  card,
  cardBody,
  legacyCardDisabled,
} from "./page.css";

export default function ItemSubtasksPage() {
  const { item, totalSubtasks } = useItem();
  const { focusedTask, setFocusedTask } = useDraggableContext();
  const { planner, isLoaded } = useCalendarProvider();
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isGoal = item.plannerType === "goal";

  // Deep link from the calendar: ?focus=<subId> opens the edit drawer on that
  // subtask, then strips the param so back/refresh don't re-open it. Gated on
  // isLoaded so a hard refresh doesn't validate against an empty planner.
  const focusParam = searchParams.get("focus");
  useEffect(() => {
    if (!focusParam || !isLoaded) return;
    if (
      focusParam !== item.id &&
      getRootParentId(planner, focusParam) === item.id
    ) {
      setFocusedTask(focusParam);
    }
    router.replace(pathname, { scroll: false });
  }, [
    focusParam,
    isLoaded,
    planner,
    item.id,
    setFocusedTask,
    router,
    pathname,
  ]);

  if (!isGoal) {
    return <div className={`${card} ${legacyCardDisabled}`} />;
  }

  const drawerOpen = !!focusedTask;
  const isRecurring = plannerHasFlexibleRecurrence(item);

  return (
    <div className={layout}>
      <div className={treePane}>
        {isRecurring && <RecurringGoalCompletionBar goal={item} />}
        <div className={`${card} ${cardBody}`}>
          <RootTaskListWrapper subtasksLength={totalSubtasks}>
            <TaskList id={item.id} />
          </RootTaskListWrapper>
          <AddSubtask task={item} parentId={item.id} isMainParent />
        </div>
      </div>
      {isMobile ? (
        <BottomSheet
          open={drawerOpen}
          onOpenChange={(next) => {
            if (!next) setFocusedTask(null);
          }}
          title="Edit subtask"
          hideTitle
          flush
        >
          <div className={drawerSheetFill}>{drawerOpen && <EditDrawer />}</div>
        </BottomSheet>
      ) : (
        <div className={`${drawerSlot} ${drawerOpen ? drawerSlotOpen : ""}`}>
          {drawerOpen && <EditDrawer />}
        </div>
      )}
    </div>
  );
}
