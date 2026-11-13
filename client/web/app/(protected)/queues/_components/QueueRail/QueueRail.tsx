"use client";

import { useState } from "react";
import type { Queue } from "@/types/prisma";
import {
  railRow,
  railRowActive,
  railRowLabel,
  railRowCount,
} from "./QueueRail.css";

type DragZone = "before" | "after";

// Transparent 1x1 GIF used as the drag image so the browser doesn't paint its
// default row screenshot; the dragging row's own dimmed styling signals the
// source. Matches the categories rail / onboarding Roles step.
const TRANSPARENT_DRAG_IMAGE: HTMLImageElement | null = (() => {
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return img;
})();

type QueueRailProps = {
  queues: Queue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (queueId: string, toIndex: number) => void;
};

export function QueueRail({
  queues,
  selectedId,
  onSelect,
  onReorder,
}: QueueRailProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{
    id: string;
    zone: DragZone;
  } | null>(null);

  const endDrag = () => {
    setDraggedId(null);
    setDragOver(null);
  };

  const handleDrop = (targetId: string, zone: DragZone) => {
    const sourceId = draggedId;
    endDrag();
    if (!sourceId || sourceId === targetId) return;
    const without = queues.filter((q) => q.id !== sourceId);
    const targetIdx = without.findIndex((q) => q.id === targetId);
    if (targetIdx === -1) return;
    onReorder(sourceId, zone === "before" ? targetIdx : targetIdx + 1);
  };

  return (
    <>
      {queues.map((queue) => {
        const dropZone = dragOver?.id === queue.id ? dragOver.zone : null;
        return (
          <div
            key={queue.id}
            className={`${railRow} ${selectedId === queue.id ? railRowActive : ""}`}
            role="button"
            tabIndex={0}
            data-dragging={draggedId === queue.id || undefined}
            data-drag-over={dropZone ?? undefined}
            draggable
            onClick={() => onSelect(queue.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(queue.id);
              }
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // Firefox needs data set or the drag won't start; the value is
              // unused (source comes from draggedId state).
              e.dataTransfer.setData("text/plain", queue.id);
              if (TRANSPARENT_DRAG_IMAGE) {
                e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
              }
              setDraggedId(queue.id);
            }}
            onDragEnd={endDrag}
            onDragOver={(e) => {
              if (!draggedId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (draggedId === queue.id) {
                if (dragOver?.id === queue.id) setDragOver(null);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const zone: DragZone =
                e.clientY - rect.top < rect.height / 2 ? "before" : "after";
              if (dragOver?.id !== queue.id || dragOver.zone !== zone) {
                setDragOver({ id: queue.id, zone });
              }
            }}
            onDragLeave={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && e.currentTarget.contains(next)) return;
              if (dragOver?.id === queue.id) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedId && dragOver && draggedId !== queue.id) {
                handleDrop(queue.id, dragOver.zone);
              } else {
                endDrag();
              }
            }}
          >
            <span className={railRowLabel}>{queue.title || "Untitled"}</span>
            <span className={railRowCount}>{queue.members.length}</span>
          </div>
        );
      })}
    </>
  );
}
