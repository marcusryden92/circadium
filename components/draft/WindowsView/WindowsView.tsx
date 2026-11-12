"use client";

import { useCalendarProvider } from "@/context/CalendarProvider";
import { CategoryDot, useResolvedCategoryColor } from "@/components/ui";
import {
  groupWindowsByCategory,
  type DiffCategoryRecord,
  type DiffWindow,
  type DiffWindowsState,
} from "@/utils/draft/diffDraftWindows";
import {
  row,
  statusBadge,
  changedFields as changedFieldsStyle,
} from "@/components/draft/JsonTreeView/JsonTreeView.css";
import {
  wrap,
  empty,
  categoryGroup,
  categoryHeader,
  categoryName,
  categoryNameDeleted,
  categoryParentNote,
  flagChip,
  dayLabel,
  timeRange,
  timeRangeDeleted,
  rowSpacer,
  metaCluster,
} from "./WindowsView.css";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface WindowsViewProps {
  diffed: DiffWindowsState;
}

export function WindowsView({ diffed }: WindowsViewProps) {
  const { weekStartDay } = useCalendarProvider();
  const groups = groupWindowsByCategory(diffed, weekStartDay);

  if (groups.length === 0) {
    return (
      <div className={wrap}>
        <div className={empty}>
          No category changes yet — the assistant can create and reorganize
          categories and set the weekly time windows that bound when their
          items may be scheduled.
        </div>
      </div>
    );
  }

  const nameById = new Map(diffed.categories.map((c) => [c.id, c.name]));

  return (
    <div className={wrap}>
      {groups.map((group) => (
        <div key={group.category.id} className={categoryGroup}>
          <CategoryHeader
            category={group.category}
            parentName={
              group.category.parentId
                ? nameById.get(group.category.parentId) ?? null
                : null
            }
          />
          {group.rows.map((window) => (
            <WindowRow key={window.id} window={window} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Non-flag field changes rendered as the friendly changed-fields text; the
// flags get their own chips with a changed highlight instead.
const CATEGORY_FIELD_LABELS: Record<string, string> = {
  name: "renamed",
  color: "color",
  parentId: "moved",
  locationId: "location",
};

function CategoryHeader({
  category,
  parentName,
}: {
  category: DiffCategoryRecord;
  parentName: string | null;
}) {
  const color = useResolvedCategoryColor(category);
  const deleted = category.status === "deleted";
  const changedNonFlagFields = category.changedFields
    .map((f) => CATEGORY_FIELD_LABELS[f])
    .filter((label): label is string => label !== undefined);
  const showParent =
    parentName !== null &&
    (category.status === "added" ||
      category.changedFields.includes("parentId"));

  return (
    <div className={categoryHeader}>
      <CategoryDot color={color} size={7} />
      <span className={deleted ? categoryNameDeleted : categoryName}>
        {category.name}
      </span>
      {showParent && (
        <span className={categoryParentNote}>under {parentName}</span>
      )}
      <span
        className={flagChip}
        data-changed={
          category.changedFields.includes("useTimeWindows") ? "true" : undefined
        }
      >
        windows {category.useTimeWindows ? "on" : "off"}
      </span>
      {(category.isStrict ||
        category.changedFields.includes("isStrict")) && (
        <span
          className={flagChip}
          data-changed={
            category.changedFields.includes("isStrict") ? "true" : undefined
          }
        >
          {category.isStrict ? "strict" : "not strict"}
        </span>
      )}
      {(category.confineToOwnWindows ||
        category.changedFields.includes("confineToOwnWindows")) && (
        <span
          className={flagChip}
          data-changed={
            category.changedFields.includes("confineToOwnWindows")
              ? "true"
              : undefined
          }
        >
          {category.confineToOwnWindows ? "own windows only" : "cascades"}
        </span>
      )}
      <span className={rowSpacer} />
      <span className={metaCluster}>
        {changedNonFlagFields.length > 0 && (
          <span className={changedFieldsStyle}>
            {changedNonFlagFields.join(", ")}
          </span>
        )}
        {category.status !== "unchanged" && (
          <span className={statusBadge[category.status]}>
            {category.status === "added"
              ? "new"
              : category.status === "modified"
                ? "edit"
                : "gone"}
          </span>
        )}
      </span>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  categoryId: "category",
  startTime: "start",
  endTime: "end",
};

function WindowRow({ window }: { window: DiffWindow }) {
  return (
    <div className={row[window.status]}>
      <span className={dayLabel}>{DAY_LABELS[window.day]}</span>
      <span
        className={window.status === "deleted" ? timeRangeDeleted : timeRange}
      >
        {window.startTime}–{window.endTime}
      </span>
      <span className={rowSpacer} />
      <span className={metaCluster}>
        {window.status === "modified" && window.changedFields.length > 0 && (
          <span className={changedFieldsStyle}>
            {window.changedFields
              .map((f) => FIELD_LABELS[f] ?? f)
              .join(", ")}
          </span>
        )}
        {window.status !== "unchanged" && (
          <span className={statusBadge[window.status]}>
            {window.status === "added"
              ? "new"
              : window.status === "modified"
                ? "edit"
                : "gone"}
          </span>
        )}
      </span>
    </div>
  );
}
