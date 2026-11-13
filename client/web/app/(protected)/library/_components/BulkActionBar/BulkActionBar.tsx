"use client";

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  FolderOpen,
  ListTree,
  Palette,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { CategoryDot } from "@/components/ui";
import { useShellOverlay } from "@/components/ui/shell/ShellOverlayContext";
import { PopoverColorPicker } from "@/components/events/PopoverColorPicker";
import { pillBtn, popover as popoverRecipe } from "@/lib/theme";
import { buildCategoryTree, type CategoryNode } from "@/utils/categoryUtils";
import { PRIORITY_LEVELS } from "@/utils/plannerPriority";
import type { Category } from "@/types/prisma";
import {
  bar,
  countLabel,
  barDivider,
  barBtn,
  btnLabel,
  escHint,
  menu,
  menuItem,
  menuItemMuted,
  priorityPopup,
  priorityRow,
  priorityPill,
} from "./BulkActionBar.css";

type MenuKey = "category" | "priority";

function flattenTree(
  nodes: CategoryNode[],
  depth: number,
  out: Array<{ category: Category; depth: number }>,
) {
  for (const node of nodes) {
    out.push({ category: node, depth });
    flattenTree(node.children, depth + 1, out);
  }
}

export function BulkActionBar({
  count,
  categories,
  currentColor,
  currentPriority,
  onAssignCategory,
  onSetColor,
  onSetPriority,
  onOpenNest,
  onDelete,
  onClear,
}: {
  count: number;
  categories: Category[];
  /** Color shared by every selected item, or "" when mixed. */
  currentColor: string;
  /** Priority shared by every selected item, or null when mixed. */
  currentPriority: number | null;
  onAssignCategory: (categoryId: string | null) => void;
  onSetColor: (color: string) => void;
  onSetPriority: (priority: number) => void;
  onOpenNest: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const barBtnClass = `${pillBtn({ variant: "glass", size: "sm" })} ${barBtn}`;

  // The bar is mounted only while a selection exists; while it's up, the
  // mobile floating menu (and corner cluster) step aside so the bar can take
  // the menu's spot at the bottom. No-op on desktop, where that chrome is
  // hidden anyway.
  useShellOverlay(true);

  const flatCategories = useMemo(() => {
    const out: Array<{ category: Category; depth: number }> = [];
    flattenTree(buildCategoryTree(categories), 0, out);
    return out;
  }, [categories]);

  const menuProps = (key: MenuKey) => ({
    open: openMenu === key,
    onOpenChange: (next: boolean) => setOpenMenu(next ? key : null),
  });

  const contentProps = {
    side: "top" as const,
    align: "center" as const,
    sideOffset: 8,
    collisionPadding: 8,
  };

  return (
    <div className={bar} role="toolbar" aria-label="Bulk actions">
      <span className={countLabel}>{count} selected</span>
      <span className={barDivider} aria-hidden />

      <Popover.Root {...menuProps("category")}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={barBtnClass}
            aria-label="Assign category"
          >
            <FolderOpen size={13} strokeWidth={2} aria-hidden />
            <span className={btnLabel}>Category</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={popoverRecipe({ size: "sm" })}
            aria-label="Assign category"
            {...contentProps}
          >
            <div className={menu}>
              <button
                type="button"
                className={`${menuItem} ${menuItemMuted}`}
                onClick={() => {
                  onAssignCategory(null);
                  setOpenMenu(null);
                }}
              >
                No category
              </button>
              {flatCategories.map(({ category, depth }) => (
                <button
                  key={category.id}
                  type="button"
                  className={menuItem}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  onClick={() => {
                    onAssignCategory(category.id);
                    setOpenMenu(null);
                  }}
                >
                  {category.color && (
                    <CategoryDot color={category.color} size={8} glow={false} />
                  )}
                  {category.name}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <PopoverColorPicker
        currentColor={currentColor}
        onChange={onSetColor}
        trigger={
          <button type="button" className={barBtnClass} aria-label="Set color">
            <Palette size={13} strokeWidth={2} aria-hidden />
            <span className={btnLabel}>Color</span>
          </button>
        }
      />

      <Popover.Root {...menuProps("priority")}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={barBtnClass}
            aria-label="Set priority"
          >
            <SlidersHorizontal size={13} strokeWidth={2} aria-hidden />
            <span className={btnLabel}>Priority</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={`${popoverRecipe({ size: "sm" })} ${priorityPopup}`}
            aria-label="Set priority"
            {...contentProps}
          >
            <div className={priorityRow}>
              {PRIORITY_LEVELS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={priorityPill}
                  aria-pressed={currentPriority === p}
                  aria-label={`Priority ${p}`}
                  onClick={() => {
                    onSetPriority(p);
                    setOpenMenu(null);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        className={barBtnClass}
        aria-label="Nest under a goal"
        onClick={onOpenNest}
      >
        <ListTree size={13} strokeWidth={2} aria-hidden />
        <span className={btnLabel}>Nest</span>
      </button>

      <button
        type="button"
        className={pillBtn({ variant: "danger", size: "sm" })}
        onClick={onDelete}
        aria-label="Delete selected"
      >
        <Trash2 size={13} strokeWidth={2} aria-hidden />
        <span className={btnLabel}>Delete</span>
      </button>

      <span className={barDivider} aria-hidden />
      <span className={escHint}>esc to clear</span>
      <button
        type="button"
        className={barBtnClass}
        aria-label="Clear selection"
        onClick={onClear}
      >
        <X size={13} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
