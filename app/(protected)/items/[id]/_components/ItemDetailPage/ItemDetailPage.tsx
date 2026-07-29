"use client";

import { Check } from "lucide-react";
import { format } from "date-fns";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import { useFlashBoolean } from "@/hooks/useFlashAnimation";
import { useCalendarProvider } from "@/context/CalendarProvider";
import {
  toggleSubtaskCompletion,
  setSubtaskCompletedAt,
} from "@/utils/goal-handlers/subtaskCompletion";
import {
  taskIsSplittable,
  splitCompletedMinutes,
  setSplitCompletedMinutes,
} from "@/utils/taskSplitting";
import { formatDatetimeLocal, parseDatetimeLocal } from "@/utils/datetime";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import { DateTimePicker, DurationField } from "@/components/ui";
import { vars } from "@/lib/theme";
import { useItem } from "../ItemContext";
import { IdentityCard } from "../IdentityCard";
import { NotesCard } from "../NotesCard";
import { RecurrenceExceptionsCard } from "../RecurrenceExceptionsCard";
import {
  NextOnCalendarCard,
  ConnectionsCard,
  NestIntoGoalCard,
} from "../SideCards";
import { SHAKE_DURATION_MS } from "../../_constants";
import {
  overviewRoot,
  overviewGrid,
  leftCol,
  rightCol,
  progressBlock,
  progressBlockTight,
  splitProgressRow,
  splitProgressTrack,
  progressMeta,
  progressMetaStrong,
  progressTrack,
  progressFill,
  completeRow,
  completeLeftGroup,
  completeCheckbox,
  completeLabel,
  completeDateWrap,
  completeDateWrapFaded,
} from "./ItemDetailPage.css";

export default function ItemOverviewPage() {
  const {
    item,
    category,
    pct,
    totalDuration,
    completedDuration,
    completedSubtasks,
    totalSubtasks,
  } = useItem();
  const { updatePlannerArray, weekStartDay } = useCalendarProvider();
  const isGoal = item.plannerType === "goal";
  const isTask = item.plannerType === "task";
  const isPlan = item.plannerType === "plan";
  const areaColor = category?.color ?? vars.accent.primary;
  const showProgress = isGoal && totalSubtasks > 0;
  // Goal-typed leaves can carry splitting too (subtree leaves are goal-typed);
  // a goal WITH subtasks keeps the subtask progress bar — root splitting is
  // inert there.
  const isSplitTask = taskIsSplittable(item) && !showProgress;
  const splitCompleted = isSplitTask ? splitCompletedMinutes(item) : 0;
  const splitPct =
    isSplitTask && item.duration > 0
      ? Math.min(100, Math.round((splitCompleted / item.duration) * 100))
      : 0;

  // A repeating task is never wholesale-completed — completion lives per
  // occurrence in the log (check off each one on the calendar), so its row-level
  // completion columns are inert. Hide the checkbox rather than render a toggle
  // the engine ignores.
  const isRecurring = plannerHasFlexibleRecurrence(item);
  // Type-aware, not a raw timestamp read: a plan-retype or a repeat rule can
  // leave stale completedEndTime on the row that must not read as "done".
  const isCompleted = plannerIsCompleted(item);
  const completedValue = formatDatetimeLocal(item.completedEndTime);

  // Completion is gated on isReady — a task can't be checked off until it's
  // been marked ready. The checkbox stays interactive so a blocked click can
  // surface a shake-and-flash instead of silently doing nothing.
  const completionLocked = !item.isReady;
  const [shakeLocked, flashShake] = useFlashBoolean(SHAKE_DURATION_MS);

  const toggleCompletion = () => {
    if (completionLocked) {
      flashShake();
      return;
    }
    updatePlannerArray((prev) => toggleSubtaskCompletion(prev, item.id));
  };

  const onCompletedAtChange = (value: string) => {
    if (completionLocked) {
      flashShake();
      return;
    }
    const iso = parseDatetimeLocal(value) || null;
    updatePlannerArray((prev) => setSubtaskCompletedAt(prev, item.id, iso));
  };

  const onSplitCompletedCommit = (minutes: number) => {
    const now = new Date();
    updatePlannerArray((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? {
              ...p,
              completedSegments: setSplitCompletedMinutes(p, minutes, now),
            }
          : p,
      ),
    );
  };

  return (
    <div className={overviewRoot}>
      <div
        className={`${progressBlock} ${isSplitTask ? progressBlockTight : ""}`}
      >
        {showProgress && (
          <>
            <div className={progressMeta}>
              <span className={progressMetaStrong}>
                {completedSubtasks} of {totalSubtasks} subtasks
              </span>
              {"  ·  "}
              {formatMinutesToHours(completedDuration)} out of{" "}
              {formatMinutesToHours(totalDuration)}
              {"  ·  "}
              <span className={progressMetaStrong}>{pct}%</span>
            </div>
            <div className={progressTrack}>
              <div
                className={progressFill}
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${areaColor}, color-mix(in srgb, ${areaColor} 80%, transparent))`,
                }}
              />
            </div>
          </>
        )}
        {isSplitTask && (
          <>
            <div className={splitProgressRow}>
              {completionLocked ? (
                <span className={progressMeta}>
                  <span className={progressMetaStrong}>
                    {formatMinutesToHours(splitCompleted)}
                  </span>
                </span>
              ) : (
                <DurationField
                  minutes={splitCompleted}
                  onCommit={onSplitCompletedCommit}
                  ariaLabel="Completed time"
                />
              )}
              <span className={progressMeta}>
                of {formatMinutesToHours(item.duration)} completed
                {"  ·  "}
                <span className={progressMetaStrong}>{splitPct}%</span>
              </span>
            </div>
            <div className={splitProgressTrack}>
              <div
                className={progressFill}
                style={{
                  width: `${splitPct}%`,
                  background: `linear-gradient(90deg, ${areaColor}, color-mix(in srgb, ${areaColor} 80%, transparent))`,
                }}
              />
            </div>
          </>
        )}
        {isPlan && (
          <div className={progressMeta}>
            <span className={progressMetaStrong}>Scheduled</span>
            {"  ·  "}
            {item.starts
              ? format(new Date(item.starts), "EEE d MMM yyyy · HH:mm")
              : "No date set"}
          </div>
        )}
        {isTask && !isSplitTask && isRecurring && (
          <div className={progressMeta}>
            <span className={progressMetaStrong}>Repeats</span>
            {"  ·  "}
            check off each occurrence on the calendar
          </div>
        )}
        {isTask && !isSplitTask && !isRecurring && (
          <div className={completeRow}>
            <div className={completeLeftGroup}>
              <button
                type="button"
                className={completeCheckbox}
                data-completed={isCompleted ? "true" : "false"}
                data-locked={completionLocked ? "true" : "false"}
                data-shake={shakeLocked ? "true" : "false"}
                onClick={toggleCompletion}
                aria-pressed={isCompleted}
                aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
                title={
                  completionLocked ? "Mark ready before completing" : undefined
                }
              >
                {isCompleted && <Check size={14} strokeWidth={3} />}
              </button>
              <span className={completeLabel}>Completed at</span>
            </div>
            <div
              className={`${completeDateWrap} ${
                isCompleted && !completionLocked ? "" : completeDateWrapFaded
              }`}
              title={
                completionLocked ? "Mark ready before completing" : undefined
              }
            >
              <DateTimePicker
                value={completedValue}
                onChange={onCompletedAtChange}
                weekStartsOn={weekStartDay}
                clearable={isCompleted && !completionLocked}
                ariaLabel="Completed at"
              />
            </div>
          </div>
        )}
      </div>

      <div className={overviewGrid}>
        <div className={leftCol}>
          <IdentityCard />
          <RecurrenceExceptionsCard />
        </div>
        <div className={rightCol}>
          <NextOnCalendarCard />
          <ConnectionsCard />
          <NestIntoGoalCard />
          <NotesCard />
        </div>
      </div>
    </div>
  );
}
