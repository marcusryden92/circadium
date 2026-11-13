import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { BottomSheet } from "@/components/ui";
import type { CategoryNode } from "@/utils/categoryUtils";
import type { SmartView } from "@/utils/dateUtils";
import { SMART_VIEWS } from "../../_lib/smartViews";
import type { Selection } from "../CategoryTreeNode";
import {
  section,
  sectionHead,
  row,
  rowActive,
  rowIcon,
  rowLabel,
  rowCount,
  rowCountAlert,
  chevronBtn,
  chevronSpacer,
  colorDot,
  noColorDot,
  emptyNote,
} from "./ScopeSheet.css";

const BASE_PADDING_PX = 16;
const DEPTH_STEP_PX = 16;

function SheetCategoryRow({
  node,
  depth,
  expanded,
  toggleExpand,
  selection,
  onPick,
  counts,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  selection: Selection;
  onPick: (s: Selection) => void;
  counts: Map<string, number>;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const active = selection.kind === "category" && selection.id === node.id;
  const count = counts.get(node.id) ?? 0;

  return (
    <>
      <button
        type="button"
        className={`${row} ${active ? rowActive : ""}`}
        onClick={() => onPick({ kind: "category", id: node.id })}
        style={{ paddingLeft: BASE_PADDING_PX + depth * DEPTH_STEP_PX }}
      >
        {hasChildren ? (
          <span
            className={chevronBtn}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
          >
            {isOpen ? (
              <ChevronDown size={15} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={15} strokeWidth={2.2} />
            )}
          </span>
        ) : (
          <span className={chevronSpacer} />
        )}
        {node.color ? (
          <span className={colorDot} style={{ background: node.color }} />
        ) : (
          <span className={noColorDot} />
        )}
        <span className={rowLabel}>{node.name}</span>
        <span className={rowCount}>{count}</span>
      </button>
      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <SheetCategoryRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpand={toggleExpand}
            selection={selection}
            onPick={onPick}
            counts={counts}
          />
        ))}
    </>
  );
}

export function ScopeSheet({
  open,
  onOpenChange,
  selection,
  onSelect,
  rootItemCount,
  smartViewCounts,
  categoryTree,
  categoryCounts,
  expanded,
  toggleExpand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  rootItemCount: number;
  smartViewCounts: Record<SmartView, number>;
  categoryTree: CategoryNode[];
  categoryCounts: Map<string, number>;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
}) {
  const pick = (s: Selection) => {
    onSelect(s);
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Browse library"
      hideTitle
      flush
    >
      <div className={section}>
        <div className={sectionHead}>Smart views</div>
        <button
          type="button"
          className={`${row} ${selection.kind === "all" ? rowActive : ""}`}
          onClick={() => pick({ kind: "all" })}
        >
          <span className={rowIcon}>
            <Layers size={15} strokeWidth={2} />
          </span>
          <span className={rowLabel}>Browse all</span>
          <span className={rowCount}>{rootItemCount}</span>
        </button>
        {SMART_VIEWS.map((v) => {
          const Icon = v.icon;
          const count = smartViewCounts[v.key];
          const active = selection.kind === "view" && selection.view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              className={`${row} ${active ? rowActive : ""}`}
              onClick={() => pick({ kind: "view", view: v.key })}
            >
              <span className={rowIcon}>
                <Icon size={15} strokeWidth={2} />
              </span>
              <span className={rowLabel}>{v.label}</span>
              <span
                className={`${rowCount} ${
                  v.alert && count > 0 ? rowCountAlert : ""
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className={section}>
        <div className={sectionHead}>Categories</div>
        {categoryTree.length === 0 ? (
          <div className={emptyNote}>No categories yet</div>
        ) : (
          categoryTree.map((node) => (
            <SheetCategoryRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selection={selection}
              onPick={pick}
              counts={categoryCounts}
            />
          ))
        )}
      </div>
    </BottomSheet>
  );
}
