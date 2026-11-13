"use client";

import {
  row,
  statusBadge,
  changedFields as changedFieldsStyle,
} from "@/components/draft/JsonTreeView/JsonTreeView.css";
import type {
  DiffDependency,
  DiffPrecedenceState,
  DiffQueue,
} from "@/utils/draft/diffDraftPrecedence";
import {
  wrap,
  empty,
  group,
  groupHeader,
  groupName,
  groupNameDeleted,
  categoryChip,
  orderNumber,
  memberTitle,
  memberTitleDeleted,
  dependencyArrow,
  rowSpacer,
  metaCluster,
} from "./PrecedenceView.css";

interface PrecedenceViewProps {
  diffed: DiffPrecedenceState;
  // Top-level item id -> title, built from the working + canonical forests so
  // draft goals and deleted goals both resolve.
  titleById: ReadonlyMap<string, string>;
  categoryNameById: ReadonlyMap<string, string>;
}

const CHANGED_FIELD_LABELS: Record<string, string> = {
  title: "renamed",
  category: "category",
  members: "members",
};

function StatusBadgeFor({ status }: { status: DiffQueue["status"] }) {
  if (status === "unchanged") return null;
  return (
    <span className={statusBadge[status]}>
      {status === "added" ? "new" : status === "modified" ? "edit" : "gone"}
    </span>
  );
}

export function PrecedenceView({
  diffed,
  titleById,
  categoryNameById,
}: PrecedenceViewProps) {
  const hasQueues = diffed.queues.length > 0;
  const hasDependencies = diffed.dependencies.length > 0;

  if (!hasQueues && !hasDependencies) {
    return (
      <div className={wrap}>
        <div className={empty}>
          No queues or dependencies yet — the assistant can line items up in
          ordered queues and link items that must finish before others start.
        </div>
      </div>
    );
  }

  const title = (id: string) => titleById.get(id) ?? "an item";

  return (
    <div className={wrap}>
      {diffed.queues.map((queue) => (
        <div key={queue.id} className={group}>
          <div className={groupHeader}>
            <span
              className={
                queue.status === "deleted" ? groupNameDeleted : groupName
              }
            >
              {queue.title}
            </span>
            {queue.categoryId && (
              <span
                className={categoryChip}
                data-changed={
                  queue.changedFields.includes("category") ? "true" : undefined
                }
              >
                {categoryNameById.get(queue.categoryId) ?? "category"}
              </span>
            )}
            <span className={rowSpacer} />
            <span className={metaCluster}>
              {queue.changedFields.length > 0 && (
                <span className={changedFieldsStyle}>
                  {queue.changedFields
                    .map((f) => CHANGED_FIELD_LABELS[f] ?? f)
                    .join(", ")}
                </span>
              )}
              <StatusBadgeFor status={queue.status} />
            </span>
          </div>
          {queue.members.map((member, i) => (
            <div key={member.plannerId} className={row[member.status]}>
              <span className={orderNumber}>
                {member.status === "deleted" ? "–" : i + 1}
              </span>
              <span
                className={
                  member.status === "deleted"
                    ? memberTitleDeleted
                    : memberTitle
                }
              >
                {title(member.plannerId)}
              </span>
              <span className={rowSpacer} />
              <span className={metaCluster}>
                <StatusBadgeFor status={member.status} />
              </span>
            </div>
          ))}
        </div>
      ))}

      {hasDependencies && (
        <div className={group}>
          <div className={groupHeader}>
            <span className={groupName}>Dependencies</span>
          </div>
          {diffed.dependencies.map((d: DiffDependency) => (
            <div
              key={`${d.predecessorId}-${d.successorId}`}
              className={row[d.status]}
            >
              <span
                className={
                  d.status === "deleted" ? memberTitleDeleted : memberTitle
                }
              >
                {title(d.predecessorId)}
              </span>
              <span className={dependencyArrow}>→ before →</span>
              <span
                className={
                  d.status === "deleted" ? memberTitleDeleted : memberTitle
                }
              >
                {title(d.successorId)}
              </span>
              <span className={rowSpacer} />
              <span className={metaCluster}>
                <StatusBadgeFor status={d.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
