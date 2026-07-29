"use client";

import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FolderPlus, Pencil, Plus } from "lucide-react";
import type { RootState } from "@/redux/store";
import {
  Button,
  Caption,
  CategoryDot,
  Loader,
  categoryColor as resolveCategoryColor,
} from "@/components/ui";
import { computeHabitTrackerStats } from "@/utils/habits/habitStats";
import { normalizeWeekStartDay } from "@/utils/calendarUtils";
import type { Habit, HabitBucket } from "@/types/prisma";
import { HabitCard } from "./_components/HabitCard/HabitCard";
import { NewHabitModal } from "./_components/NewHabitModal/NewHabitModal";
import { BucketModal } from "./_components/BucketModal/BucketModal";
import { AddHabitItemModal } from "./_components/AddHabitItemModal/AddHabitItemModal";
import {
  page,
  header,
  headerActions,
  title,
  bucketHeader,
  bucketName,
  bucketEditBtn,
  bucketEmpty,
  list,
  empty,
  sections,
} from "./page.css";

// The habits surface: buckets (the habits domain's own grouping, separate
// from item categories) of habit trackers, each deriving its month grid +
// consistency stats from the occurrence completions of the repeating items
// linked to it. All tracker writes are direct actions mirrored into the
// habits slice — no engine involvement.
export function HabitsClient() {
  const planner = useSelector((s: RootState) => s.calendarSource.planner);
  const isCalendarLoaded = useSelector(
    (s: RootState) => s.calendarSource.isLoaded,
  );
  const { buckets, habits, items, isLoaded } = useSelector(
    (s: RootState) => s.habits,
  );
  const completions = useSelector(
    (s: RootState) => s.occurrenceCompletions.rows,
  );
  const scheduledEvents = useSelector(
    (s: RootState) => s.engineOutput.calendar,
  );
  const weekStartDay = normalizeWeekStartDay(
    useSelector((s: RootState) => s.schedulingSettings.weekStartDay),
  );

  const [showNewHabit, setShowNewHabit] = useState(false);
  const [newHabitBucketId, setNewHabitBucketId] = useState<string | null>(
    null,
  );
  const [bucketModal, setBucketModal] = useState<{
    open: boolean;
    bucket: HabitBucket | null;
  }>({ open: false, bucket: null });
  const [addItemHabit, setAddItemHabit] = useState<Habit | null>(null);

  const bucketById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b])),
    [buckets],
  );

  // Every bucket renders (a fresh one must be visible even before it holds
  // habits); unsorted habits collect in a trailing section.
  const sectionsData = useMemo(() => {
    const byBucket = new Map<string | null, Habit[]>();
    for (const habit of habits) {
      const key =
        habit.bucketId && bucketById.has(habit.bucketId)
          ? habit.bucketId
          : null;
      const group = byBucket.get(key);
      if (group) group.push(habit);
      else byBucket.set(key, [habit]);
    }
    const ordered: { bucket: HabitBucket | null; habits: Habit[] }[] =
      buckets.map((bucket) => ({
        bucket,
        habits: byBucket.get(bucket.id) ?? [],
      }));
    const loose = byBucket.get(null);
    if (loose) ordered.push({ bucket: null, habits: loose });
    return ordered;
  }, [habits, buckets, bucketById]);

  const openNewHabit = (bucketId: string | null) => {
    setNewHabitBucketId(bucketId);
    setShowNewHabit(true);
  };

  const now = new Date();
  const ready = isLoaded && isCalendarLoaded;
  const nothingYet = habits.length === 0 && buckets.length === 0;

  return (
    <div className={page}>
      <div className={header}>
        <h1 className={title}>Habits</h1>
        <div className={headerActions}>
          <Button
            variant="glass"
            size="sm"
            onClick={() => setBucketModal({ open: true, bucket: null })}
          >
            <FolderPlus size={14} strokeWidth={2.2} /> New bucket
          </Button>
          <Button variant="solid" size="sm" onClick={() => openNewHabit(null)}>
            <Plus size={14} strokeWidth={2.2} /> New habit
          </Button>
        </div>
      </div>

      {!ready ? (
        <div className={empty}>
          <Loader size="sm" label="Loading habits" />
        </div>
      ) : nothingYet ? (
        <div className={empty}>
          <Caption>No habits yet.</Caption>
          <Caption>
            Create a habit, then link the repeating tasks, goals, or plans
            whose occurrences should count toward it.
          </Caption>
          <Button variant="glass" size="sm" onClick={() => openNewHabit(null)}>
            <Plus size={14} strokeWidth={2.2} /> New habit
          </Button>
        </div>
      ) : (
        <div className={sections}>
          {sectionsData.map(({ bucket, habits: group }) => (
            <section key={bucket?.id ?? "unsorted"}>
              <div className={bucketHeader}>
                <CategoryDot
                  color={resolveCategoryColor({
                    color: bucket?.color ?? null,
                  })}
                  size={8}
                />
                <span className={bucketName}>
                  {bucket?.name ?? "Unsorted"}
                </span>
                <Caption>{group.length}</Caption>
                {bucket && (
                  <>
                    <button
                      type="button"
                      className={bucketEditBtn}
                      aria-label={`Edit bucket ${bucket.name}`}
                      onClick={() => setBucketModal({ open: true, bucket })}
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={bucketEditBtn}
                      aria-label={`New habit in ${bucket.name}`}
                      onClick={() => openNewHabit(bucket.id)}
                    >
                      <Plus size={13} strokeWidth={2.2} />
                    </button>
                  </>
                )}
              </div>
              {group.length === 0 ? (
                <div className={bucketEmpty}>
                  <Caption>No habits here yet.</Caption>
                </div>
              ) : (
                <div className={list}>
                  {group.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      habitItems={items}
                      planners={planner}
                      bucket={
                        habit.bucketId
                          ? bucketById.get(habit.bucketId)
                          : undefined
                      }
                      stats={computeHabitTrackerStats({
                        habit,
                        habitItems: items,
                        planners: planner,
                        completions,
                        now,
                        scheduledEvents,
                      })}
                      weekStartDay={weekStartDay}
                      onAddItem={() => setAddItemHabit(habit)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <NewHabitModal
        open={showNewHabit}
        onOpenChange={setShowNewHabit}
        buckets={buckets}
        defaultBucketId={newHabitBucketId}
      />
      <BucketModal
        open={bucketModal.open}
        bucket={bucketModal.bucket}
        onOpenChange={(open) =>
          setBucketModal((prev) => ({ open, bucket: open ? prev.bucket : null }))
        }
      />
      <AddHabitItemModal
        habit={addItemHabit}
        habitItems={items}
        planners={planner}
        onClose={() => setAddItemHabit(null)}
      />
    </div>
  );
}
