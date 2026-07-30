"use client";

import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Check, ChevronRight } from "lucide-react";
import type { RootState } from "@/redux/store";
import type { Planner } from "@/types/prisma";
import { DateTimePicker } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { formatDatetimeLocal, parseDatetimeLocal } from "@/utils/datetime";
import {
  buildRecurringInstances,
  manualCompletionWindow,
  INSTANCE_HORIZON_DAYS,
  INSTANCE_MAX_ROWS,
  type RecurringInstance,
} from "@/utils/recurringInstances";
import { useOccurrenceCompletion } from "./useOccurrenceCompletion";
import { formatPeriodLabel } from "./periodLabel";
import { RecurringCompletionModal } from "./RecurringCompletionModal";
import {
  list,
  instanceRow,
  instanceRowButton,
  periodLabel,
  statusPill,
  checkbox,
  rowChevron,
  empty,
} from "./RecurringCompletion.css";

const STATUS_LABEL: Record<RecurringInstance["status"], string> = {
  completed: "Done",
  missed: "Missed",
  pending: "Open",
  upcoming: "Upcoming",
};

// Item-detail instances surface for a flexibly recurring task or goal. Tasks
// toggle each period inline and edit the completed time; goals show per-period
// progress and open the completion modal (per-leaf editing) — matching the
// "structure vs completion" split.
export function RecurringInstances({ item }: { item: Planner }) {
  const { planner, updateAll, weekStartDay } = useCalendarProvider();
  const rows = useSelector((s: RootState) => s.occurrenceCompletions.rows);
  const setCompleted = useOccurrenceCompletion(updateAll);
  const [modalPeriod, setModalPeriod] = useState<string | null>(null);
  const isGoal = item.plannerType === "goal";

  const instances = useMemo(
    () =>
      buildRecurringInstances({
        item,
        planners: planner,
        completions: rows,
        now: new Date(),
        horizonDays: INSTANCE_HORIZON_DAYS,
        limit: INSTANCE_MAX_ROWS,
      }),
    [item, planner, rows],
  );

  const toggleTask = (inst: RecurringInstance) => {
    setCompleted(
      item.id,
      inst.key,
      inst.status === "completed"
        ? null
        : manualCompletionWindow(inst, item.duration, new Date()),
    );
  };

  // Re-log the completed period at a user-picked end time (start back-dated by
  // the item's duration); clearing the picker un-completes it.
  const editTaskTime = (inst: RecurringInstance, value: string) => {
    const endIso = parseDatetimeLocal(value);
    if (!endIso) {
      setCompleted(item.id, inst.key, null);
      return;
    }
    const start = new Date(
      new Date(endIso).getTime() - Math.max(1, item.duration) * 60_000,
    );
    setCompleted(item.id, inst.key, {
      start: start.toISOString(),
      end: endIso,
    });
  };

  if (instances.length === 0) {
    return <div className={empty}>No instances yet.</div>;
  }

  return (
    <>
      <div className={list}>
        {instances.map((inst) =>
          isGoal ? (
            <button
              key={inst.key}
              type="button"
              className={instanceRowButton}
              onClick={() => setModalPeriod(inst.key)}
            >
              <span className={periodLabel}>{formatPeriodLabel(inst)}</span>
              <span className={statusPill} data-status={inst.status}>
                {inst.status === "completed"
                  ? STATUS_LABEL.completed
                  : `${inst.doneLeaves}/${inst.totalLeaves}`}
              </span>
              <ChevronRight className={rowChevron} size={16} strokeWidth={2} />
            </button>
          ) : (
            <div key={inst.key} className={instanceRow}>
              <span className={periodLabel}>{formatPeriodLabel(inst)}</span>
              {inst.status === "completed" ? (
                <DateTimePicker
                  variant="bare"
                  size="sm"
                  value={formatDatetimeLocal(inst.completedAt)}
                  onChange={(value) => editTaskTime(inst, value)}
                  weekStartsOn={weekStartDay}
                  clearable
                  ariaLabel="Completed at"
                />
              ) : (
                <span className={statusPill} data-status={inst.status}>
                  {STATUS_LABEL[inst.status]}
                </span>
              )}
              <button
                type="button"
                className={checkbox}
                data-completed={inst.status === "completed"}
                onClick={() => toggleTask(inst)}
                aria-label={
                  inst.status === "completed"
                    ? "Mark incomplete"
                    : "Mark complete"
                }
              >
                {inst.status === "completed" && (
                  <Check size={14} strokeWidth={3} />
                )}
              </button>
            </div>
          ),
        )}
      </div>

      {isGoal && (
        <RecurringCompletionModal
          open={modalPeriod !== null}
          goal={item}
          initialPeriodKey={modalPeriod}
          onClose={() => setModalPeriod(null)}
        />
      )}
    </>
  );
}
