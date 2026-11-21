"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { X } from "lucide-react";
import type { Category, Planner, Queue } from "@/types/prisma";
import { TypeBadge, CategoryBadge } from "@/components/ui";
import {
  plannerCompletedEnd,
  plannerIsCompleted,
} from "@/utils/plannerCompletion";
import { formatDurationCompact } from "@/utils/timeFormatting";
import { sortQueueMembers } from "@/utils/queue-handlers/mutateQueueMembers";
import {
  list,
  memberRow,
  orderNumber,
  memberTitle,
  memberTitleLink,
  memberHint,
  inheritedBadge,
  memberSpacer,
  memberDuration,
  memberRemove,
  emptyNote,
  historyToggle,
  historyPanel,
  historyRow,
  historyDate,
  historyRemove,
} from "./QueueMemberList.css";

type DragZone = "before" | "after";

const TRANSPARENT_DRAG_IMAGE: HTMLImageElement | null = (() => {
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return img;
})();

type QueueMemberListProps = {
  queue: Queue;
  planner: Planner[];
  categories: Category[];
  // `toIndex` addresses the order after the moved member is removed.
  onReorder: (plannerId: string, toIndex: number) => void;
  onRemove: (plannerId: string) => void;
};

export function QueueMemberList({
  queue,
  planner,
  categories,
  onReorder,
  onRemove,
}: QueueMemberListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{
    id: string;
    zone: DragZone;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const plannerById = new Map(planner.map((p) => [p.id, p]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const queueCategory = queue.categoryId
    ? categoryById.get(queue.categoryId)
    : undefined;

  // Full member order — the drop-index math must run against it, because
  // `toIndex` addresses the whole queue (completed members included; they are
  // hidden from display but still transparent links in the chain).
  const rows = sortQueueMembers(queue.members)
    .map((m) => plannerById.get(m.plannerId))
    .filter((p): p is Planner => !!p);

  const activeRows = rows.filter((p) => !plannerIsCompleted(p));
  // Oldest first, newest at the bottom — the panel opens scrolled to its end,
  // so scrolling up walks backwards in time.
  const completedRows = rows
    .filter((p) => plannerIsCompleted(p))
    .sort((a, b) =>
      (plannerCompletedEnd(a) ?? a.updatedAt).localeCompare(
        plannerCompletedEnd(b) ?? b.updatedAt,
      ),
    );

  useEffect(() => {
    if (!historyOpen) return;
    const panel = historyRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [historyOpen, completedRows.length]);

  const endDrag = () => {
    setDraggedId(null);
    setDragOver(null);
  };

  const handleDrop = (targetPlannerId: string, zone: DragZone) => {
    const sourceId = draggedId;
    endDrag();
    if (!sourceId || sourceId === targetPlannerId) return;
    const without = rows.filter((p) => p.id !== sourceId);
    const targetIdx = without.findIndex((p) => p.id === targetPlannerId);
    if (targetIdx === -1) return;
    onReorder(sourceId, zone === "before" ? targetIdx : targetIdx + 1);
  };

  if (rows.length === 0) {
    return (
      <div className={emptyNote}>
        Nothing in this queue yet — add tasks or goals and they will be
        scheduled in order.
      </div>
    );
  }

  return (
    <div className={list}>
      {completedRows.length > 0 && (
        <button
          type="button"
          className={historyToggle}
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((prev) => !prev)}
        >
          History · {completedRows.length}
        </button>
      )}
      {historyOpen && completedRows.length > 0 && (
        <div className={historyPanel} ref={historyRef}>
          {completedRows.map((item) => {
            const completedEnd = plannerCompletedEnd(item);
            return (
              <div key={item.id} className={historyRow}>
                <span className={memberTitle}>
                  <Link
                    href={`/items/${item.id}`}
                    className={memberTitleLink}
                    draggable={false}
                  >
                    {item.title || "Untitled"}
                  </Link>
                </span>
                <span className={memberSpacer} />
                {completedEnd && (
                  <span className={historyDate}>
                    {format(new Date(completedEnd), "MMM d")}
                  </span>
                )}
                <button
                  type="button"
                  className={historyRemove}
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title || "item"} from queue`}
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {activeRows.length === 0 ? (
        <div className={emptyNote}>
          Everything in this queue is completed.
        </div>
      ) : (
        activeRows.map((item, index) => {
          const unreadyGoal =
            item.plannerType === "goal" && item.isReady !== true;
          const ownCategory = item.categoryId
            ? categoryById.get(item.categoryId)
            : undefined;
          const shownCategory = ownCategory ?? queueCategory;
          const isInherited = !ownCategory && !!queueCategory;
          const dropZone = dragOver?.id === item.id ? dragOver.zone : null;

          return (
            <div
              key={item.id}
              className={memberRow}
              data-dragging={draggedId === item.id || undefined}
              data-drag-over={dropZone ?? undefined}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                // Firefox needs data set or the drag won't start.
                e.dataTransfer.setData("text/plain", item.id);
                if (TRANSPARENT_DRAG_IMAGE) {
                  e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
                }
                setDraggedId(item.id);
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (!draggedId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (draggedId === item.id) {
                  if (dragOver?.id === item.id) setDragOver(null);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const zone: DragZone =
                  e.clientY - rect.top < rect.height / 2 ? "before" : "after";
                if (dragOver?.id !== item.id || dragOver.zone !== zone) {
                  setDragOver({ id: item.id, zone });
                }
              }}
              onDragLeave={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                if (dragOver?.id === item.id) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId && dragOver && draggedId !== item.id) {
                  handleDrop(item.id, dragOver.zone);
                } else {
                  endDrag();
                }
              }}
            >
              <span className={orderNumber}>{index + 1}</span>
              <TypeBadge size="sm">{item.plannerType}</TypeBadge>
              <span className={memberTitle}>
                <Link
                  href={`/items/${item.id}`}
                  className={memberTitleLink}
                  draggable={false}
                >
                  {item.title || "Untitled"}
                </Link>
              </span>
              {unreadyGoal && (
                <span className={memberHint}>not ready — passes through</span>
              )}
              <span className={memberSpacer} />
              {shownCategory && (
                <CategoryBadge
                  size="sm"
                  color={shownCategory.color ?? "currentColor"}
                  className={isInherited ? inheritedBadge : undefined}
                  title={
                    isInherited
                      ? `Inherited from the queue's category`
                      : undefined
                  }
                >
                  {shownCategory.name}
                </CategoryBadge>
              )}
              {item.duration > 0 && (
                <span className={memberDuration}>
                  {formatDurationCompact(item.duration)}
                </span>
              )}
              <button
                type="button"
                className={memberRemove}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.title || "item"} from queue`}
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
