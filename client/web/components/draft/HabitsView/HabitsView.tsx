"use client";

import {
  row,
  statusBadge,
  changedFields as changedFieldsStyle,
} from "@/components/draft/JsonTreeView/JsonTreeView.css";
import type {
  DraftHabitBucketDiff,
  DraftHabitDiff,
  DraftHabitsDiff,
} from "@/utils/draft/diffDraftHabits";
import {
  wrap,
  empty,
  group,
  groupHeader,
  groupName,
  groupNameDeleted,
  bucketHeading,
  bucketHeadingName,
  bucketHeadingNameDeleted,
  itemTitle,
  itemTitleDeleted,
  trackedLabel,
  rowSpacer,
  metaCluster,
} from "./HabitsView.css";

interface HabitsViewProps {
  diff: DraftHabitsDiff;
  // Top-level item id -> title, built from the working + canonical forests so
  // draft items and deleted items both resolve.
  titleById: ReadonlyMap<string, string>;
}

function StatusBadgeFor({ status }: { status: DraftHabitDiff["status"] }) {
  if (status === "unchanged") return null;
  return (
    <span className={statusBadge[status]}>
      {status === "added" ? "new" : status === "modified" ? "edit" : "gone"}
    </span>
  );
}

function HabitEntry({
  entry,
  titleById,
}: {
  entry: DraftHabitDiff;
  titleById: ReadonlyMap<string, string>;
}) {
  const title = (id: string) => titleById.get(id) ?? "an item";
  return (
    <div className={group}>
      <div className={groupHeader}>
        <span
          className={entry.status === "deleted" ? groupNameDeleted : groupName}
        >
          {entry.habit.name}
        </span>
        <span className={rowSpacer} />
        <span className={metaCluster}>
          {entry.changedFields.length > 0 && (
            <span className={changedFieldsStyle}>
              {entry.changedFields.join(", ")}
            </span>
          )}
          <StatusBadgeFor status={entry.status} />
        </span>
      </div>
      {entry.items.length === 0 ? (
        <div className={row.unchanged}>
          <span className={trackedLabel}>tracks nothing yet</span>
        </div>
      ) : (
        entry.items.map((item) => (
          <div key={item.plannerId} className={row[item.status]}>
            <span className={trackedLabel}>tracks</span>
            <span
              className={
                item.status === "deleted" ? itemTitleDeleted : itemTitle
              }
            >
              {title(item.plannerId)}
            </span>
            <span className={rowSpacer} />
            <span className={metaCluster}>
              {item.status !== "unchanged" && (
                <span className={statusBadge[item.status]}>
                  {item.status === "added" ? "new" : "gone"}
                </span>
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function BucketHeading({ entry }: { entry: DraftHabitBucketDiff }) {
  return (
    <div className={bucketHeading}>
      <span
        className={
          entry.status === "deleted"
            ? bucketHeadingNameDeleted
            : bucketHeadingName
        }
      >
        {entry.bucket.name}
      </span>
      <span className={rowSpacer} />
      <span className={metaCluster}>
        {entry.changedFields.length > 0 && (
          <span className={changedFieldsStyle}>
            {entry.changedFields.join(", ")}
          </span>
        )}
        <StatusBadgeFor status={entry.status} />
      </span>
    </div>
  );
}

// Habits grouped under their buckets, mirroring the Habits page: bucket
// headings carry their own diff badges, unsorted habits trail. A bucket with
// no habits still renders when it changed (a fresh or deleted bucket is a
// change to review); unchanged empty buckets are omitted.
export function HabitsView({ diff, titleById }: HabitsViewProps) {
  if (diff.buckets.length === 0 && diff.habits.length === 0) {
    return (
      <div className={wrap}>
        <div className={empty}>
          No habits yet — the assistant can create buckets and habit trackers,
          and link the repeating tasks, goals, or plans whose occurrences count
          toward them.
        </div>
      </div>
    );
  }

  const knownBucketIds = new Set(diff.buckets.map((b) => b.bucket.id));
  const habitsByBucket = new Map<string | null, DraftHabitDiff[]>();
  for (const entry of diff.habits) {
    const key =
      entry.habit.bucketId && knownBucketIds.has(entry.habit.bucketId)
        ? entry.habit.bucketId
        : null;
    const list = habitsByBucket.get(key);
    if (list) list.push(entry);
    else habitsByBucket.set(key, [entry]);
  }
  const unsorted = habitsByBucket.get(null) ?? [];

  return (
    <div className={wrap}>
      {diff.buckets.map((bucketEntry) => {
        const habits = habitsByBucket.get(bucketEntry.bucket.id) ?? [];
        if (habits.length === 0 && bucketEntry.status === "unchanged") {
          return null;
        }
        return (
          <div key={bucketEntry.bucket.id}>
            <BucketHeading entry={bucketEntry} />
            {habits.map((entry) => (
              <HabitEntry
                key={entry.habit.id}
                entry={entry}
                titleById={titleById}
              />
            ))}
          </div>
        );
      })}
      {unsorted.length > 0 && (
        <div>
          {diff.buckets.length > 0 && (
            <div className={bucketHeading}>
              <span className={bucketHeadingName}>Unsorted</span>
            </div>
          )}
          {unsorted.map((entry) => (
            <HabitEntry
              key={entry.habit.id}
              entry={entry}
              titleById={titleById}
            />
          ))}
        </div>
      )}
    </div>
  );
}
