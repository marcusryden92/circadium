"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Flame, Check, X, Plus, Trash2 } from "lucide-react";
import { useDispatch } from "react-redux";
import {
  Glass,
  CategoryDot,
  ConfirmModal,
  TypeBadge,
  categoryColor as resolveCategoryColor,
} from "@/components/ui";
import { progressTrack } from "@/lib/theme";
import { orderedWeekDays } from "@/utils/calendarUtils";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type { AppDispatch } from "@/redux/store";
import type {
  Habit,
  HabitBucket,
  HabitItem,
  Planner,
} from "@/types/prisma";
import {
  habitGridWeeks,
  type HabitTrackerStats,
} from "@/utils/habits/habitStats";
import { deleteHabit, removeHabitItem } from "@/actions/habits";
import {
  removeHabit as removeHabitFromStore,
  removeHabitItem as removeHabitItemFromStore,
} from "@/redux/slices/habitsSlice";
import {
  card,
  head,
  title,
  headActions,
  iconBtn,
  itemChips,
  itemChip,
  itemChipLabel,
  itemChipRemove,
  addItemChip,
  dayGrid,
  weekRow,
  weekdayLabel,
  dayCell,
  rateRow,
  meterTrack,
  meterFill,
  rateValue,
  statsRow,
  statChip,
  streakChip,
} from "./HabitCard.css";

const WEEKDAY_NARROW: Record<WeekDayIntegers, string> = {
  0: "Su",
  1: "Mo",
  2: "Tu",
  3: "We",
  4: "Th",
  5: "Fr",
  6: "Sa",
};

export function HabitCard({
  habit,
  habitItems,
  planners,
  bucket,
  stats,
  weekStartDay,
  onAddItem,
}: {
  habit: Habit;
  habitItems: HabitItem[];
  planners: Planner[];
  bucket: HabitBucket | undefined;
  stats: HabitTrackerStats;
  weekStartDay: WeekDayIntegers;
  onAddItem: () => void;
}) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const color = resolveCategoryColor({
    color: habit.color ?? bucket?.color ?? null,
  });

  const trackedRows = useMemo(() => {
    const byId = new Map(planners.map((p) => [p.id, p]));
    return habitItems
      .filter((i) => i.habitId === habit.id)
      .map((i) => byId.get(i.plannerId))
      .filter((p): p is Planner => !!p);
  }, [habitItems, planners, habit.id]);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const weekDays = orderedWeekDays(weekStartDay);
  const weeks = useMemo(
    () => habitGridWeeks(stats.days, weekStartDay),
    [stats.days, weekStartDay],
  );
  const ratePct = stats.period
    ? Math.round(stats.period.completionRate * 100)
    : null;

  const onRemoveItem = (plannerId: string) => {
    void removeHabitItem({ habitId: habit.id, plannerId })
      .then(() =>
        dispatch(removeHabitItemFromStore({ habitId: habit.id, plannerId })),
      )
      .catch(() => {});
  };

  const onDeleteHabit = () => {
    setConfirmDelete(false);
    void deleteHabit({ habitId: habit.id })
      .then(() => dispatch(removeHabitFromStore({ habitId: habit.id })))
      .catch(() => {});
  };

  return (
    <Glass radius="lg" className={card}>
      <div className={head}>
        <CategoryDot color={color} size={9} />
        <span className={title}>{habit.name}</span>
        <div className={headActions}>
          <button
            type="button"
            className={iconBtn}
            aria-label="Delete habit"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className={itemChips}>
        {trackedRows.map((row) => (
          <span
            key={row.id}
            className={itemChip}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/items/${row.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/items/${row.id}`);
            }}
          >
            <TypeBadge size="sm">{row.plannerType}</TypeBadge>
            <span className={itemChipLabel}>{row.title}</span>
            <button
              type="button"
              className={itemChipRemove}
              aria-label={`Stop tracking ${row.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveItem(row.id);
              }}
            >
              <X size={11} strokeWidth={2.2} />
            </button>
          </span>
        ))}
        <button type="button" className={addItemChip} onClick={onAddItem}>
          <Plus size={12} strokeWidth={2.2} />
          <span className={itemChipLabel}>
            {trackedRows.length === 0 ? "Track an item" : "Add item"}
          </span>
        </button>
      </div>

      <div className={dayGrid} aria-label="Last 30 days">
        <div className={weekRow}>
          {weekDays.map((day) => (
            <span key={day} className={weekdayLabel}>
              {WEEKDAY_NARROW[day]}
            </span>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={weekRow}>
            {week.map((cell, cellIndex) =>
              cell ? (
                <span
                  key={cell.dayKey}
                  className={dayCell}
                  data-done={cell.completedCount > 0}
                  data-off={cell.completedCount === 0 && !cell.expected}
                  data-today={cell.dayKey === todayKey}
                  title={`${format(cell.date, "MMM d")}${
                    cell.completedCount > 0
                      ? ` — ${cell.completedCount} completed`
                      : cell.expected
                        ? ""
                        : " — nothing to track"
                  }`}
                >
                  {cell.completedCount > 1 ? cell.completedCount : ""}
                </span>
              ) : (
                <span
                  key={`pad-${weekIndex}-${cellIndex}`}
                  className={dayCell}
                  data-pad="true"
                />
              ),
            )}
          </div>
        ))}
      </div>

      {stats.period && ratePct !== null ? (
        <>
          <div className={rateRow}>
            <div className={`${progressTrack()} ${meterTrack}`}>
              <div
                className={meterFill}
                style={{
                  width: `${ratePct}%`,
                  background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
                }}
              />
            </div>
            <span className={rateValue}>{ratePct}%</span>
          </div>
          <div className={statsRow}>
            <span className={streakChip}>
              <Flame size={13} strokeWidth={2.2} /> {stats.period.currentStreak}
            </span>
            <span className={statChip}>
              <Check size={13} strokeWidth={2.2} /> {stats.period.completedCount}
            </span>
            <span className={statChip}>
              <X size={13} strokeWidth={2.2} /> {stats.period.missedCount}
            </span>
          </div>
        </>
      ) : (
        <div className={statsRow}>
          <span className={statChip}>
            <Check size={13} strokeWidth={2.2} /> {stats.totalCompletions} in
            the last 30 days
          </span>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        title={`Delete "${habit.name}"?`}
        body="The tracked items themselves are untouched — only the habit and its history grouping go."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDeleteHabit}
      />
    </Glass>
  );
}
