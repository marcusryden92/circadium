"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Clock, Copy, Trash2 } from "lucide-react";
import { EventImpl } from "@fullcalendar/core/internal";
import { format } from "date-fns";
import useTitleEditor from "@/hooks/useTitleEditor";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { PopoverLocationPicker } from "../PopoverLocationPicker";
import { PopoverColorPicker } from "../PopoverColorPicker";
import { handleEventCopy } from "@/utils/calendarEventHandlers";
import {
  assignLocationToPlanner,
  setUseParentLocation,
} from "@/actions/locations";
import { timeOnDate } from "@/utils/calendarUtils";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import { taskIsSplittable, splitCompletedMinutes } from "@/utils/taskSplitting";
import { PlannerType } from "@/types/prisma";
import { calendarColors } from "@/data/calendarColors";
import {
  getCompleteTaskTreeIds,
  getRootParentId,
} from "@/utils/goalPageHandlers";
import { Button, CategoryBadge, FieldStack, TypeBadge } from "@/components/ui";
import { vars } from "@/lib/theme";
import { CalendarPopover } from "../CalendarPopover";
import {
  POPOVER_WIDTH,
  popoverBody,
  fullBleedLandscape,
  PopoverHeader,
  PopoverTitleRow,
  PopoverWhen,
  PopoverTimeFields,
  PopoverNote,
  PopoverFooter,
} from "../popover";

interface EventPopoverProps {
  event: EventImpl;
  eventRect: DOMRect;
  startTime: Date;
  endTime: Date;
  isCompleted: boolean;
  displayPostponeButton: boolean;
  onClose: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onPostpone: () => void;
  onEditStartTime?: (newStart: Date) => void;
  onEditEndTime?: (newEnd: Date) => void;
  setShowPopover: React.Dispatch<React.SetStateAction<boolean>>;
}

const POPOVER_HEIGHT = 430;

function formatSplitProgress(completed: number, total: number): string {
  const fmt = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };
  return `${fmt(completed)} of ${fmt(total)} done`;
}

const EventPopover: React.FC<EventPopoverProps> = ({
  event,
  eventRect,
  startTime,
  endTime,
  isCompleted,
  displayPostponeButton,
  onClose,
  onDelete,
  onComplete,
  onPostpone,
  onEditStartTime,
  onEditEndTime,
  setShowPopover,
}) => {
  const router = useRouter();
  const {
    updateAll,
    planner,
    calendar,
    categories,
    updatePlannerArray,
    inheritedLocationMap,
  } = useCalendarProvider();

  // Recurring-plan occurrence events carry composite ids; resolve to the
  // owning planner row for every row-level lookup below.
  const plannerId = plannerIdFromEventId(event.id);

  const currentColor =
    (planner.find((p) => p.id === plannerId)?.color as string | undefined) ??
    calendarColors[0];

  const applyColor = (color: string) => {
    const tree = getCompleteTaskTreeIds(planner, plannerId);
    const newPlanner = planner.map((item) =>
      tree.includes(item.id) ? { ...item, color } : item,
    );
    const newCalendar = calendar.map((item) =>
      tree.includes(plannerIdFromEventId(item.id))
        ? { ...item, backgroundColor: color }
        : item,
    );
    updateAll(newPlanner, newCalendar);
  };

  const plannerItem = useMemo(
    () => planner.find((p) => p.id === plannerId),
    [planner, plannerId],
  );

  const inheritedInfo = plannerItem
    ? inheritedLocationMap.get(plannerItem.id)
    : undefined;
  const categoryHasLocation = !!inheritedInfo;

  const [locationOverrideEnabled, setLocationOverrideEnabled] = useState(
    () => !categoryHasLocation || !plannerItem?.useParentLocation,
  );

  useEffect(() => {
    setLocationOverrideEnabled(
      !categoryHasLocation || !plannerItem?.useParentLocation,
    );
  }, [categoryHasLocation, plannerItem?.useParentLocation]);

  const handleLocationChange = async (locationId: string | null) => {
    updatePlannerArray((prev) =>
      prev.map((p) =>
        p.id === plannerId ? { ...p, locationId: locationId } : p,
      ),
    );
    try {
      await assignLocationToPlanner(plannerId, locationId);
    } catch (error) {
      console.error("Failed to update location:", error);
    }
  };

  const handleToggleLocationOverride = useCallback(async () => {
    if (!plannerItem || !categoryHasLocation) return;
    const newOverrideEnabled = !locationOverrideEnabled;
    const newUseParent = !newOverrideEnabled;
    updatePlannerArray((prev) =>
      prev.map((p) =>
        p.id === plannerItem.id ? { ...p, useParentLocation: newUseParent } : p,
      ),
    );
    setLocationOverrideEnabled(newOverrideEnabled);
    try {
      await setUseParentLocation(plannerItem.id, newUseParent);
    } catch (error) {
      console.error("Failed to toggle location override:", error);
    }
  }, [
    plannerItem,
    categoryHasLocation,
    locationOverrideEnabled,
    updatePlannerArray,
  ]);

  const {
    isEditing,
    title,
    setTitle,
    inputRef,
    startEditing,
    handleSave,
    handleCancel,
    handleKeyDown,
    handleBlur,
  } = useTitleEditor({ event });

  const onCopy = () => {
    setShowPopover(false);
    handleEventCopy(event, updateAll);
  };

  const openFullEditor = () => {
    setShowPopover(false);
    const rootId = getRootParentId(planner, plannerId) ?? plannerId;
    // A subtask opens its root's subtasks tree with the edit drawer on it —
    // the root overview would leave the user hunting for the clicked item.
    router.push(
      rootId === plannerId
        ? `/items/${rootId}`
        : `/items/${rootId}/subtasks?focus=${plannerId}`,
    );
  };

  const plannerType = event.extendedProps.plannerType as
    | PlannerType
    | undefined;
  const isTemplate = !!event.extendedProps.isTemplateItem;
  const showStatusActions =
    !isTemplate &&
    (plannerType === PlannerType.task ||
      plannerType === PlannerType.goal ||
      plannerType === PlannerType.habit);
  // Only a real plan gets the plan-specific affordances (Duplicate). A habit is
  // engine-placed like a task/goal, not a fixed anchor.
  const isPlan = plannerType === PlannerType.plan;

  const durationMinutes = Math.max(
    0,
    Math.round((endTime.getTime() - startTime.getTime()) / 60000),
  );
  const durationLabel = (() => {
    if (durationMinutes < 60) return `${durationMinutes}m`;
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  })();

  const typeLabel = (plannerType ?? "task").toString();

  // Resolve the category chain (root → leaf) for the item, so nested category
  // breadcrumbs render in the header. Walks the planner-parent chain first to
  // find the effective categoryId (subtasks/sub-goals inherit from their goal
  // ancestor), then walks the category-parent chain to build the breadcrumb.
  const categoryChain = useMemo(() => {
    let effectiveCategoryId: string | null = null;
    const seenPlanners = new Set<string>();
    let cursor: typeof plannerItem = plannerItem;
    while (cursor && !seenPlanners.has(cursor.id)) {
      seenPlanners.add(cursor.id);
      if (cursor.categoryId) {
        effectiveCategoryId = cursor.categoryId;
        break;
      }
      if (!cursor.parentId) break;
      const next = planner.find((p) => p.id === cursor!.parentId);
      cursor = next;
    }
    if (!effectiveCategoryId) return [];

    const chain: { id: string; name: string; color?: string | null }[] = [];
    const seenCats = new Set<string>();
    let curId: string | null | undefined = effectiveCategoryId;
    while (curId && !seenCats.has(curId)) {
      seenCats.add(curId);
      const cat = categories.find((c) => c.id === curId);
      if (!cat) break;
      chain.unshift({ id: cat.id, name: cat.name, color: cat.color });
      curId = cat.parentId ?? null;
    }
    return chain;
  }, [plannerItem, planner, categories]);

  const leafCategory = categoryChain[categoryChain.length - 1];

  const canEditTimes = !!(onEditStartTime || onEditEndTime);

  return (
    <CalendarPopover
      anchorRect={eventRect}
      width={POPOVER_WIDTH}
      height={POPOVER_HEIGHT}
      title={event.title || "Event details"}
      onClose={() => {
        if (isEditing) handleSave();
        onClose();
      }}
      onEscape={isEditing ? handleCancel : onClose}
    >
      {({ startDrag, isDragging }) => (
        <>
          <PopoverHeader
            onStartDrag={startDrag}
            isDragging={isDragging}
            onClose={onClose}
            badges={
              <>
                <TypeBadge size="sm">{typeLabel}</TypeBadge>
                {leafCategory && (
                  <CategoryBadge size="sm" color={leafCategory.color ?? vars.muted}>
                    {leafCategory.name}
                  </CategoryBadge>
                )}
              </>
            }
          />

          <PopoverTitleRow
            editor={{
              isEditing,
              value: title,
              inputRef,
              onChange: setTitle,
              onBlur: handleBlur,
              onKeyDown: handleKeyDown,
              onStartEditing: startEditing,
            }}
            trailing={
              <PopoverColorPicker
                currentColor={currentColor}
                onChange={applyColor}
              />
            }
          />

          <div className={popoverBody}>
            <PopoverWhen start={startTime} end={endTime} suffix={durationLabel} />

            {canEditTimes && (
              <PopoverTimeFields
                start={{
                  value: format(startTime, "HH:mm"),
                  onChange: onEditStartTime
                    ? (next) => {
                        const newStart = timeOnDate(startTime, next);
                        if (newStart.getTime() === startTime.getTime()) return;
                        onEditStartTime(newStart);
                      }
                    : undefined,
                }}
                end={{
                  value: format(endTime, "HH:mm"),
                  onChange: onEditEndTime
                    ? (next) => {
                        // End at or before start wraps to the next morning.
                        let newEnd = timeOnDate(startTime, next);
                        if (newEnd <= startTime) {
                          newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000);
                        }
                        if (newEnd.getTime() === endTime.getTime()) return;
                        onEditEndTime(newEnd);
                      }
                    : undefined,
                }}
              />
            )}

            {plannerItem && taskIsSplittable(plannerItem) && (
              <PopoverNote
                className={fullBleedLandscape}
                icon={<Check size={13} strokeWidth={2} aria-hidden />}
              >
                {formatSplitProgress(
                  splitCompletedMinutes(plannerItem),
                  plannerItem.duration,
                )}
              </PopoverNote>
            )}

            {plannerItem && (
              <FieldStack size="sm" label="Location">
                <PopoverLocationPicker
                  value={plannerItem.locationId ?? null}
                  onChange={handleLocationChange}
                  isOverridden={locationOverrideEnabled}
                  onToggleOverride={
                    inheritedInfo ? handleToggleLocationOverride : undefined
                  }
                  inheritedLocationName={inheritedInfo?.locationName}
                  inheritedFromLabel={inheritedInfo?.fromLabel}
                />
              </FieldStack>
            )}

            <PopoverFooter
              utility={
                <>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={onDelete}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 size={13} strokeWidth={2} color={vars.status.error} />
                  </Button>
                  {isPlan && (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={onCopy}
                      aria-label="Duplicate"
                      title="Duplicate"
                    >
                      <Copy size={13} strokeWidth={2} />
                    </Button>
                  )}
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={openFullEditor}
                    aria-label="Open full editor"
                    title="Open full editor"
                  >
                    <ArrowUpRight size={13} strokeWidth={2} />
                  </Button>
                </>
              }
              primary={
                showStatusActions ? (
                  <>
                    <Button
                      variant={isCompleted ? "glass" : "solid"}
                      size="sm"
                      onClick={onComplete}
                    >
                      <Check size={13} strokeWidth={2.2} />
                      {isCompleted ? "Completed" : "Complete"}
                    </Button>
                    {displayPostponeButton && (
                      <Button variant="glass" size="sm" onClick={onPostpone}>
                        <Clock size={13} strokeWidth={2} />
                        Postpone
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />
          </div>
        </>
      )}
    </CalendarPopover>
  );
};

export default EventPopover;
