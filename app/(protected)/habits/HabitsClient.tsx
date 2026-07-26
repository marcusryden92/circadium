"use client";

import { useMemo } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { Caption, Loader } from "@/components/ui";
import { computeHabitStats } from "@/utils/habits/habitStats";
import { HabitCard } from "./_components/HabitCard/HabitCard";
import { page, header, title, list, empty } from "./page.css";

export function HabitsClient() {
  const planner = useSelector((s: RootState) => s.calendarSource.planner);
  const isLoaded = useSelector((s: RootState) => s.calendarSource.isLoaded);
  const rows = useSelector((s: RootState) => s.habitCompletions.rows);

  const habits = useMemo(
    () => planner.filter((p) => p.plannerType === "habit"),
    [planner],
  );

  const cards = useMemo(() => {
    const now = new Date();
    return habits.map((habit) => ({
      habit,
      stats: computeHabitStats({ habit, completions: rows, now }),
    }));
  }, [habits, rows]);

  return (
    <div className={page}>
      <div className={header}>
        <h1 className={title}>Habits</h1>
        <Caption>{habits.length} tracked</Caption>
      </div>

      {!isLoaded ? (
        <div className={empty}>
          <Loader size="sm" label="Loading habits" />
        </div>
      ) : habits.length === 0 ? (
        <div className={empty}>
          <Caption>No habits yet.</Caption>
          <Caption>
            Create one from the library, set its type to Habit, and give it a
            repeat cadence and an allowed-times window (e.g. clean, Fri or Sat).
          </Caption>
        </div>
      ) : (
        <div className={list}>
          {cards.map(({ habit, stats }) => (
            <HabitCard key={habit.id} habit={habit} stats={stats} />
          ))}
        </div>
      )}
    </div>
  );
}
