"use client";

import { ChevronDown, ChevronRight, GripVertical, Plus } from "lucide-react";
import type { CategoryNode } from "@/utils/categoryUtils";
import {
  railRow,
  railRowActive,
  railRowDot,
  railRowNoDot,
  railRowLabel,
  railRowCount,
  railRowAddChild,
  railRowGrip,
  treeChevron,
  treeChevronSpacer,
} from "../../page.css";
import { useCategoryDrag } from "./useCategoryDrag";

// Category drag is folder-like: sibling order carries no scheduling meaning,
// so there is no reordering — a drop either nests the dragged category under
// the target row or (on the rail background) moves it out to top level.
export type CategoryDropTarget =
  | { kind: "into"; id: string }
  | { kind: "root" };

export function CategoryTreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  selectedId,
  onSelect,
  counts,
  onAddChild,
  draggedId,
  setDraggedId,
  dragOver,
  setDragOver,
  onDrop,
  droppedId,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  counts: Map<string, number>;
  onAddChild: (parentId: string) => void;
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;
  dragOver: CategoryDropTarget | null;
  setDragOver: (s: CategoryDropTarget | null) => void;
  onDrop: (sourceId: string, target: CategoryDropTarget) => void;
  droppedId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const active = selectedId === node.id;
  const count = counts.get(node.id) ?? 0;
  const isDragging = draggedId === node.id;
  const isDragTarget = dragOver?.kind === "into" && dragOver.id === node.id;

  const { onGripPointerDown } = useCategoryDrag({
    nodeId: node.id,
    isTopLevel: depth === 0,
    setDraggedId,
    setDragOver,
    onDrop,
  });

  return (
    <>
      <button
        type="button"
        className={`${railRow} ${active ? railRowActive : ""}`}
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: 8 + depth * 14 }}
        data-category-id={node.id}
        data-dragging={isDragging ? "true" : "false"}
        data-drag-over={isDragTarget ? "true" : undefined}
        data-dropped={droppedId === node.id ? "true" : undefined}
      >
        {/* span (not button) because the row itself is already a button —
            nested buttons are invalid. role + tabIndex preserve a11y. */}
        <span
          className={railRowGrip}
          aria-label="Drag to move"
          role="button"
          tabIndex={-1}
          onPointerDown={onGripPointerDown}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} strokeWidth={2} />
        </span>
        {hasChildren ? (
          <span
            className={treeChevron}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
          >
            {isOpen ? (
              <ChevronDown size={11} strokeWidth={2.4} />
            ) : (
              <ChevronRight size={11} strokeWidth={2.4} />
            )}
          </span>
        ) : (
          <span className={treeChevronSpacer} />
        )}
        {node.color ? (
          <span className={railRowDot} style={{ background: node.color }} />
        ) : (
          <span className={railRowNoDot} />
        )}
        <span className={railRowLabel}>{node.name}</span>
        <span className={railRowCount}>{count}</span>
        <span
          role="button"
          tabIndex={-1}
          className={railRowAddChild}
          aria-label={
            depth === 0
              ? `Add category to ${node.name}`
              : `Add sub-category to ${node.name}`
          }
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
        >
          <Plus size={11} strokeWidth={2.4} />
        </span>
      </button>
      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <CategoryTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpand={toggleExpand}
            selectedId={selectedId}
            onSelect={onSelect}
            counts={counts}
            onAddChild={onAddChild}
            draggedId={draggedId}
            setDraggedId={setDraggedId}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onDrop={onDrop}
            droppedId={droppedId}
          />
        ))}
    </>
  );
}
