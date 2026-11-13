"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { getTaskTreeIds } from "@/utils/goalPageHandlers";
import { bucketEventsByDay, getDuration } from "@/utils/calendarUtils";
import {
  plannerHasFlexibleRecurrence,
  plannerIdFromEventId,
} from "@/utils/planRecurrence";
import { formatDurationCompact, relativeDayLabel } from "@/utils/timeFormatting";
import { Button } from "@/components/ui";
import { useItem } from "../_components/ItemContext";
import { RecurringInstances } from "../_components/RecurringCompletion";
import type { SimpleEvent } from "@/types/prisma";
import {
  root,
  sectionLabel,
  dayGroup,
  dayHeader,
  dayHeaderDate,
  dayHeaderRelative,
  eventRow,
  eventTime,
  eventTitle,
  eventDuration,
  emptyState,
} from "./page.css";

export default function ItemSchedulePage() {
  const { item } = useItem();
  const { calendar, planner } = useCalendarProvider();
  const [showPast, setShowPast] = useState(false);

  const treeIds = useMemo(() => {
    if (item.plannerType !== "goal") return new Set([item.id]);
    return new Set(getTaskTreeIds(planner, item.id));
  }, [planner, item.id, item.plannerType]);

  const itemEvents = useMemo(() => {
    return calendar
      .filter((e) => {
        if (treeIds.has(plannerIdFromEventId(e.id))) return true;
        const ext = e.extendedProps as { parentId?: string | null } | undefined;
        return !!ext?.parentId && treeIds.has(ext.parentId);
      })
      .sort(
        (a, b) =>
          new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [calendar, treeIds]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcoming: SimpleEvent[] = [];
    const past: SimpleEvent[] = [];
    for (const e of itemEvents) {
      if (new Date(e.end).getTime() >= now) upcoming.push(e);
      else past.push(e);
    }
    return { upcoming, past };
  }, [itemEvents]);

  const upcomingBuckets = useMemo(
    () => bucketEventsByDay(upcoming),
    [upcoming],
  );
  const pastBuckets = useMemo(
    () => bucketEventsByDay([...past].reverse()),
    [past],
  );

  const isGoalWithSubtasks =
    item.plannerType === "goal" && treeIds.size > 1;

  // A flexibly recurring task/goal has no single scheduled block — it recurs
  // per period. Its schedule surface is the per-period instance list (status +
  // completion), not the raw event stream.
  const isRecurring = plannerHasFlexibleRecurrence(item);

  const renderBucket = (bucket: { dayKey: string; date: Date; events: SimpleEvent[] }) => {
    const rel = relativeDayLabel(bucket.date);
    return (
      <div key={bucket.dayKey} className={dayGroup}>
        <div className={dayHeader}>
          <span className={dayHeaderDate}>
            {format(bucket.date, "EEE, MMM d")}
          </span>
          {rel && <span className={dayHeaderRelative}>{rel}</span>}
        </div>
        {bucket.events.map((e) => (
          <div key={e.id} className={eventRow}>
            <span className={eventTime}>
              {format(new Date(e.start), "HH:mm")}{" — "}
              {format(new Date(e.end), "HH:mm")}
            </span>
            <span className={eventTitle} title={e.title}>
              {isGoalWithSubtasks ? e.title : item.title}
            </span>
            <span className={eventDuration}>
              {formatDurationCompact(getDuration(e.start, e.end))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (isRecurring) {
    return (
      <div className={root}>
        <section>
          <div className={sectionLabel}>Instances</div>
          <RecurringInstances item={item} />
        </section>
      </div>
    );
  }

  return (
    <div className={root}>
      <section>
        <div className={sectionLabel}>Upcoming</div>
        {upcomingBuckets.length === 0 ? (
          <div className={emptyState}>Not scheduled yet.</div>
        ) : (
          upcomingBuckets.map(renderBucket)
        )}
      </section>

      {past.length > 0 && (
        <section>
          <div className={sectionLabel}>Past</div>
          {showPast ? (
            pastBuckets.map(renderBucket)
          ) : (
            <Button
              variant="outlined"
              size="sm"
              onClick={() => setShowPast(true)}
            >
              Show {past.length} past event{past.length === 1 ? "" : "s"}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
