import { ChevronRight, ChevronDown } from "lucide-react";
import { listRow } from "@/lib/theme";
import type { CategoryNode } from "@/utils/categoryUtils";
import type { SmartView } from "@/utils/dateUtils";
import {
  railRow,
  railRowActive,
  railRowLabel,
  railRowCount,
  treeChevron,
  treeChevronSpacer,
  treeColorDot,
  treeNoColor,
} from "../../page.css";

const TREE_BASE_PADDING_PX = 8;
const TREE_DEPTH_STEP_PX = 14;

export type Selection =
  | { kind: "all" }
  | { kind: "view"; view: SmartView }
  | { kind: "category"; id: string };

export function CategoryTreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  selection,
  setSelection,
  counts,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  selection: Selection;
  setSelection: (s: Selection) => void;
  counts: Map<string, number>;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const active = selection.kind === "category" && selection.id === node.id;
  const count = counts.get(node.id) ?? 0;

  return (
    <>
      <button
        className={`${listRow()} ${railRow} ${active ? railRowActive : ""}`}
        onClick={() => setSelection({ kind: "category", id: node.id })}
        style={{
          paddingLeft: TREE_BASE_PADDING_PX + depth * TREE_DEPTH_STEP_PX,
        }}
      >
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
          <span className={treeColorDot} style={{ background: node.color }} />
        ) : (
          <span className={treeNoColor} />
        )}
        <span className={railRowLabel}>{node.name}</span>
        <span className={railRowCount}>{count}</span>
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
            selection={selection}
            setSelection={setSelection}
            counts={counts}
          />
        ))}
    </>
  );
}
