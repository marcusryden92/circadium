"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Caption, Input, TypeBadge } from "@/components/ui";
import { parsePlanRecurrence } from "@/utils/planRecurrence";
import { addHabitItem } from "@/actions/habits";
import { upsertHabitItem } from "@/redux/slices/habitsSlice";
import type { AppDispatch } from "@/redux/store";
import type { Habit, HabitItem, Planner } from "@/types/prisma";
import {
  overlay,
  dialog,
  list,
  row,
  rowTitle,
  emptyState,
} from "./AddHabitItemModal.css";

// Link an existing REPEATING item to a habit: triaged root rows whose
// recurrence parses (flexible rule on a task/goal, occurrence rule on a plan)
// and that this habit doesn't already track. One-off items never appear —
// a habit counts occurrences, so there must be occurrences to count.
export function AddHabitItemModal({
  habit,
  habitItems,
  planners,
  onClose,
}: {
  habit: Habit | null;
  habitItems: HabitItem[];
  planners: Planner[];
  onClose: () => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (habit) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [habit]);

  const { eligible, anyTrackable } = useMemo(() => {
    if (!habit) return { eligible: [], anyTrackable: false };
    const tracked = new Set(
      habitItems.filter((i) => i.habitId === habit.id).map((i) => i.plannerId),
    );
    const trackable = planners.filter(
      (p) =>
        !p.parentId &&
        p.isTriaged &&
        parsePlanRecurrence(p.recurrence) !== null &&
        !tracked.has(p.id),
    );
    const q = query.trim().toLowerCase();
    return {
      eligible: trackable
        .filter((p) => q.length === 0 || p.title.toLowerCase().includes(q))
        .slice(0, 40),
      anyTrackable: trackable.length > 0,
    };
  }, [habit, habitItems, planners, query]);

  const assign = (plannerId: string) => {
    if (!habit) return;
    void addHabitItem({ habitId: habit.id, plannerId })
      .then((item) => dispatch(upsertHabitItem(item)))
      .catch(() => {});
    onClose();
  };

  return (
    <Dialog.Root
      open={habit !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title style={{ position: "absolute", left: -10000 }}>
            Track an item
          </Dialog.Title>
          <Caption>
            track a repeating item in {habit ? `"${habit.name}"` : "this habit"}
          </Caption>
          <Input
            ref={inputRef}
            variant="underline"
            placeholder="Search your repeating items"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {eligible.length === 0 ? (
            <div className={emptyState}>
              {anyTrackable ? (
                <Caption>No matching items.</Caption>
              ) : (
                <>
                  <Caption>Nothing repeats yet.</Caption>
                  <Caption>
                    Habits count occurrences, so give a task, goal, or plan a
                    repeat rule first — then link it here.
                  </Caption>
                </>
              )}
            </div>
          ) : (
            <div className={list}>
              {eligible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={row}
                  onClick={() => assign(p.id)}
                >
                  <TypeBadge size="sm">{p.plannerType}</TypeBadge>
                  <span className={rowTitle}>{p.title}</span>
                </button>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
