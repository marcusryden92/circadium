"use client";

import { useMemo } from "react";
import { space } from "@/lib/theme/scales";
import {
  inspector,
  section,
  sectionHead,
  overviewGrid,
  statChip,
  treeRoot,
  rootSummaryRow,
  rootTitle,
  chip,
  chipAccent,
  childList,
  nodeRow,
  nodeTitle,
  plainRow,
  rowKicker,
  emptyNote,
  subGroup,
  subGroupTitle,
} from "./SnapshotInspector.css";

// Lenient readers over the circadium.data-export.v1 blob: every field is
// optional so a snapshot from an older export version still renders what it
// has instead of crashing the inspector.

interface SnapshotPlanner {
  id: string;
  title?: string;
  parentId?: string | null;
  plannerType?: string;
  duration?: number;
  deadline?: string | null;
  starts?: string | null;
  recurrence?: string | null;
  splitting?: string | null;
  isReady?: boolean | null;
  isTriaged?: boolean;
  sortOrder?: number;
  priority?: number;
  categoryId?: string | null;
  locationId?: string | null;
  linkedItemId?: string | null;
  notes?: string | null;
}

interface SnapshotTemplate {
  id: string;
  title?: string;
  startDay?: string;
  startTime?: string;
  duration?: number;
  locationId?: string | null;
}

interface SnapshotWindow {
  id: string;
  day?: number;
  startTime?: string;
  endTime?: string;
}

interface SnapshotCategory {
  id: string;
  name?: string;
  parentId?: string | null;
  locationId?: string | null;
  useTimeWindows?: boolean;
  isStrict?: boolean;
  confineToOwnWindows?: boolean;
  timeSlots?: SnapshotWindow[];
}

interface SnapshotQueue {
  id: string;
  title?: string;
  categoryId?: string | null;
  members?: { plannerId?: string; sortOrder?: number }[];
}

interface SnapshotDependency {
  predecessorId?: string;
  successorId?: string;
}

interface SnapshotHabitBucket {
  id: string;
  name?: string;
}

interface SnapshotHabit {
  id: string;
  name?: string;
  bucketId?: string | null;
}

interface SnapshotHabitItem {
  habitId?: string;
  plannerId?: string;
}

interface SnapshotLocation {
  id: string;
  name?: string;
}

interface Snapshot {
  meta?: { exportedAt?: string; format?: string };
  profile?: { name?: string | null; email?: string | null } | null;
  planners?: SnapshotPlanner[];
  weeklyTemplates?: SnapshotTemplate[];
  categories?: SnapshotCategory[];
  locations?: SnapshotLocation[];
  queues?: SnapshotQueue[];
  dependencies?: SnapshotDependency[];
  habitBuckets?: SnapshotHabitBucket[];
  habits?: SnapshotHabit[];
  habitItems?: SnapshotHabitItem[];
  calendarEvents?: unknown[];
  externalCalendarSources?: unknown[];
  occurrenceCompletions?: unknown[];
  schedulingPreferences?: { weekStartDay?: number } | null;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TEMPLATE_DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const formatMinutes = (minutes: number | undefined): string | null => {
  if (typeof minutes !== "number" || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function PlannerChips({
  node,
  categoryName,
  locationName,
}: {
  node: SnapshotPlanner;
  categoryName?: string | null;
  locationName?: string | null;
}) {
  const duration = formatMinutes(node.duration);
  const deadline = formatDate(node.deadline);
  const starts = formatDate(node.starts);
  return (
    <>
      {node.plannerType && <span className={chipAccent}>{node.plannerType}</span>}
      {duration && <span className={chip}>{duration}</span>}
      {starts && <span className={chip}>starts {starts}</span>}
      {deadline && <span className={chip}>due {deadline}</span>}
      {node.recurrence && <span className={chip}>repeats</span>}
      {node.splitting && <span className={chip}>split</span>}
      {node.linkedItemId && <span className={chip}>detour link</span>}
      {node.isReady === false && <span className={chip}>not ready</span>}
      {typeof node.priority === "number" && node.priority !== 4 && (
        <span className={chip}>priority {node.priority}</span>
      )}
      {categoryName && <span className={chip}>{categoryName}</span>}
      {locationName && <span className={chip}>@ {locationName}</span>}
    </>
  );
}

export function SnapshotInspector({ data }: { data: Record<string, unknown> }) {
  const snapshot = data as Snapshot;

  const planners = useMemo(() => snapshot.planners ?? [], [snapshot]);
  const categories = useMemo(() => snapshot.categories ?? [], [snapshot]);
  const locations = useMemo(() => snapshot.locations ?? [], [snapshot]);

  const plannerById = useMemo(
    () => new Map(planners.map((p) => [p.id, p])),
    [planners],
  );
  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name ?? "Unnamed"])),
    [categories],
  );
  const locationNameById = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name ?? "Unnamed"])),
    [locations],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, SnapshotPlanner[]>();
    for (const planner of planners) {
      if (!planner.parentId) continue;
      const list = map.get(planner.parentId) ?? [];
      list.push(planner);
      map.set(planner.parentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return map;
  }, [planners]);

  const roots = useMemo(
    () =>
      planners
        .filter((p) => !p.parentId && p.isTriaged !== false)
        .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    [planners],
  );
  const untriaged = useMemo(
    () => planners.filter((p) => !p.parentId && p.isTriaged === false),
    [planners],
  );

  const categoryChildren = useMemo(() => {
    const map = new Map<string | null, SnapshotCategory[]>();
    for (const category of categories) {
      const key = category.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(category);
      map.set(key, list);
    }
    return map;
  }, [categories]);

  const templatesByDay = useMemo(() => {
    const map = new Map<string, SnapshotTemplate[]>();
    for (const template of snapshot.weeklyTemplates ?? []) {
      const key = template.startDay ?? "unknown";
      const list = map.get(key) ?? [];
      list.push(template);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return map;
  }, [snapshot]);

  const habitsByBucket = useMemo(() => {
    const map = new Map<string | null, SnapshotHabit[]>();
    for (const habit of snapshot.habits ?? []) {
      const key = habit.bucketId ?? null;
      const list = map.get(key) ?? [];
      list.push(habit);
      map.set(key, list);
    }
    return map;
  }, [snapshot]);

  const habitItemsByHabit = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of snapshot.habitItems ?? []) {
      if (!item.habitId || !item.plannerId) continue;
      const list = map.get(item.habitId) ?? [];
      list.push(item.plannerId);
      map.set(item.habitId, list);
    }
    return map;
  }, [snapshot]);

  const plannerTitle = (id: string | undefined): string =>
    (id && plannerById.get(id)?.title) || "Unknown item";

  const renderChildren = (parentId: string, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    if (children.length === 0) return null;
    return (
      <div className={childList} style={{ paddingLeft: depth * 16 }}>
        {children.map((child) => (
          <div key={child.id}>
            <div className={nodeRow}>
              <span className={nodeTitle}>{child.title ?? "Untitled"}</span>
              <PlannerChips
                node={child}
                locationName={
                  child.locationId
                    ? locationNameById.get(child.locationId)
                    : null
                }
              />
            </div>
            {renderChildren(child.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  const renderCategoryTree = (parentId: string | null, depth: number) => {
    const children = categoryChildren.get(parentId) ?? [];
    if (children.length === 0) return null;
    return (
      <>
        {children.map((category) => (
          <div key={category.id} style={{ paddingLeft: depth * 16 }}>
            <div className={nodeRow}>
              <span className={nodeTitle}>{category.name ?? "Unnamed"}</span>
              {category.useTimeWindows &&
                (category.timeSlots?.length ?? 0) > 0 && (
                  <span className={chipAccent}>windows</span>
                )}
              {category.isStrict && <span className={chip}>strict</span>}
              {category.confineToOwnWindows && (
                <span className={chip}>own windows only</span>
              )}
              {category.locationId && (
                <span className={chip}>
                  @ {locationNameById.get(category.locationId) ?? "Unknown"}
                </span>
              )}
            </div>
            {(category.timeSlots ?? []).map((window) => (
              <div
                key={window.id}
                className={plainRow}
                style={{ paddingLeft: space["4"] }}
              >
                <span className={rowKicker}>
                  {typeof window.day === "number"
                    ? DAY_NAMES[window.day] ?? `Day ${window.day}`
                    : "?"}
                </span>
                {window.startTime}–{window.endTime}
              </div>
            ))}
            {renderCategoryTree(category.id, depth + 1)}
          </div>
        ))}
      </>
    );
  };

  const counts: [string, number][] = [
    ["items", planners.length],
    ["templates", (snapshot.weeklyTemplates ?? []).length],
    ["categories", categories.length],
    ["locations", locations.length],
    ["queues", (snapshot.queues ?? []).length],
    ["dependencies", (snapshot.dependencies ?? []).length],
    ["habits", (snapshot.habits ?? []).length],
    ["calendar events", (snapshot.calendarEvents ?? []).length],
    ["external sources", (snapshot.externalCalendarSources ?? []).length],
    ["completions", (snapshot.occurrenceCompletions ?? []).length],
  ];

  return (
    <div className={inspector}>
      <div className={section}>
        <div className={sectionHead}>Overview</div>
        <div className={plainRow}>
          {snapshot.profile?.name ?? "Unnamed user"} ·{" "}
          {snapshot.profile?.email ?? "no email"} · exported{" "}
          {formatDate(snapshot.meta?.exportedAt) ?? "unknown"}
        </div>
        <div className={overviewGrid}>
          {counts.map(([label, count]) => (
            <span key={label} className={statChip}>
              {count} {label}
            </span>
          ))}
        </div>
      </div>

      <div className={section}>
        <div className={sectionHead}>Items ({roots.length} top-level)</div>
        {roots.length === 0 ? (
          <span className={emptyNote}>No triaged top-level items.</span>
        ) : (
          roots.map((root) => (
            <details key={root.id} className={treeRoot}>
              <summary>
                <span className={rootSummaryRow}>
                  <span className={rootTitle}>{root.title ?? "Untitled"}</span>
                  <PlannerChips
                    node={root}
                    categoryName={
                      root.categoryId
                        ? categoryNameById.get(root.categoryId)
                        : null
                    }
                    locationName={
                      root.locationId
                        ? locationNameById.get(root.locationId)
                        : null
                    }
                  />
                </span>
              </summary>
              {renderChildren(root.id, 1) ?? (
                <div className={plainRow}>No subtasks.</div>
              )}
            </details>
          ))
        )}
        {untriaged.length > 0 && (
          <details className={treeRoot}>
            <summary>
              <span className={rootSummaryRow}>
                <span className={rootTitle}>
                  Untriaged capture inbox ({untriaged.length})
                </span>
              </span>
            </summary>
            <div className={childList}>
              {untriaged.map((jot) => (
                <div key={jot.id} className={nodeRow}>
                  <span className={nodeTitle}>{jot.title ?? "Untitled"}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className={section}>
        <div className={sectionHead}>Week templates</div>
        {(snapshot.weeklyTemplates ?? []).length === 0 ? (
          <span className={emptyNote}>No weekly templates.</span>
        ) : (
          TEMPLATE_DAY_ORDER.filter((day) => templatesByDay.has(day)).map(
            (day) => (
              <div key={day}>
                {(templatesByDay.get(day) ?? []).map((template) => (
                  <div key={template.id} className={plainRow}>
                    <span className={rowKicker}>
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </span>
                    {template.startTime} ·{" "}
                    {formatMinutes(template.duration) ?? "?"} ·{" "}
                    {template.title ?? "Untitled"}
                    {template.locationId && (
                      <span className={chip}>
                        @{" "}
                        {locationNameById.get(template.locationId) ??
                          "Unknown"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ),
          )
        )}
      </div>

      <div className={section}>
        <div className={sectionHead}>Categories</div>
        {categories.length === 0 ? (
          <span className={emptyNote}>No categories.</span>
        ) : (
          renderCategoryTree(null, 0)
        )}
      </div>

      <div className={section}>
        <div className={sectionHead}>Queues</div>
        {(snapshot.queues ?? []).length === 0 ? (
          <span className={emptyNote}>No queues.</span>
        ) : (
          (snapshot.queues ?? []).map((queue) => (
            <div key={queue.id} className={subGroup}>
              <span className={subGroupTitle}>
                {queue.title ?? "Untitled queue"}
                {queue.categoryId && (
                  <>
                    {" "}
                    <span className={chip}>
                      {categoryNameById.get(queue.categoryId) ?? "Unknown"}
                    </span>
                  </>
                )}
              </span>
              {[...(queue.members ?? [])]
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                .map((member, index) => (
                  <div key={member.plannerId ?? index} className={plainRow}>
                    <span className={rowKicker}>{index + 1}.</span>
                    {plannerTitle(member.plannerId)}
                  </div>
                ))}
            </div>
          ))
        )}
      </div>

      <div className={section}>
        <div className={sectionHead}>Dependencies</div>
        {(snapshot.dependencies ?? []).length === 0 ? (
          <span className={emptyNote}>No dependencies.</span>
        ) : (
          (snapshot.dependencies ?? []).map((edge, index) => (
            <div key={index} className={plainRow}>
              {plannerTitle(edge.predecessorId)} → before →{" "}
              {plannerTitle(edge.successorId)}
            </div>
          ))
        )}
      </div>

      <div className={section}>
        <div className={sectionHead}>Habits</div>
        {(snapshot.habits ?? []).length === 0 ? (
          <span className={emptyNote}>No habit trackers.</span>
        ) : (
          [
            ...(snapshot.habitBuckets ?? []).map(
              (bucket) => [bucket.id, bucket.name ?? "Unnamed"] as const,
            ),
            [null, "Unsorted"] as const,
          ]
            .filter(([bucketId]) => (habitsByBucket.get(bucketId) ?? []).length > 0)
            .map(([bucketId, bucketName]) => (
              <div key={bucketId ?? "unsorted"} className={subGroup}>
                <span className={subGroupTitle}>{bucketName}</span>
                {(habitsByBucket.get(bucketId) ?? []).map((habit) => (
                  <div key={habit.id} className={plainRow}>
                    <span className={rowKicker}>{habit.name ?? "Unnamed"}</span>
                    {(habitItemsByHabit.get(habit.id) ?? [])
                      .map((plannerId) => plannerTitle(plannerId))
                      .join(", ") || "no tracked items"}
                  </div>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
