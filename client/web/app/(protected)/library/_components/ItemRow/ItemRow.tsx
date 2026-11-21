import { useState } from "react";
import { Check, ChevronRight, MoreHorizontal, Trash2 } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { Caption, CategoryDot, TypeBadge, vars } from "@/components/ui";
import { iconBtn, popover as popoverRecipe } from "@/lib/theme";
import { isItemOverdue } from "@/utils/plannerStatus";
import { plannerCompletedEnd } from "@/utils/plannerCompletion";
import { formatDurationCompact } from "@/utils/timeFormatting";
import { plannerTypeBadgeTone } from "@/utils/badgeTone";
import type { Planner, Category } from "@/types/prisma";
import {
  tableRow,
  tableRowSelected,
  cellCheck,
  rowCheckbox,
  cellTitle,
  titleText,
  cellMuted,
  cellOverdue,
  cellLocation,
  cellProgress,
  cellProgressPct,
  rowActions,
  rowMenuBtn,
  rowMenu,
  rowMenuItem,
  rowMenuItemDanger,
} from "../../page.css";
import {
  card,
  cardSelected,
  cardCheck,
  cardCheckbox,
  cardMain,
  cardTitle,
  cardMeta,
  cardMetaItem,
  cardMetaOverdue,
  cardMetaCategoryName,
  cardSide,
  cardMenuBtn,
} from "./ItemRow.css";

export function ItemRow({
  item,
  category,
  goalProgress,
  remainingDuration,
  onClick,
  now,
  selected,
  onToggleSelect,
  onDelete,
  mobile = false,
}: {
  item: Planner;
  category?: Category;
  goalProgress?: number;
  remainingDuration?: number;
  onClick: () => void;
  now: Date;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  mobile?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOverdue = isItemOverdue(item, now);

  const showProgressInstead =
    goalProgress != null && goalProgress > 0 && goalProgress < 1;
  // Draftness is the untriaged state, not readiness. A triaged item is either
  // ready to schedule or deliberately held off the calendar ("Not ready").
  const statusLabel = plannerCompletedEnd(item)
    ? "Done"
    : !item.isTriaged
      ? "Draft"
      : item.isReady
        ? "Ready"
        : "Not ready";

  const menu = (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`${iconBtn({ size: "sm" })} ${mobile ? cardMenuBtn : rowMenuBtn}`}
          aria-label={`Actions for ${item.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={popoverRecipe({ size: "sm" })}
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={rowMenu}>
            <button
              type="button"
              className={`${rowMenuItem} ${rowMenuItemDanger}`}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 size={13} strokeWidth={2} aria-hidden />
              Delete
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  if (mobile) {
    const durationLabel =
      remainingDuration != null
        ? remainingDuration > 0
          ? formatDurationCompact(remainingDuration)
          : null
        : item.duration > 0
          ? formatDurationCompact(item.duration)
          : null;
    const deadlineDate = item.deadline ? new Date(item.deadline) : null;
    const deadlineLabel = deadlineDate
      ? format(
          deadlineDate,
          deadlineDate.getFullYear() === now.getFullYear()
            ? "MMM d"
            : "MMM d, yyyy",
        )
      : null;

    return (
      <div
        className={`${card} ${selected ? cardSelected : ""}`}
        onClick={onClick}
        role="button"
      >
        <div className={cardCheck} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${item.title}`}
            data-checked={selected ? "true" : undefined}
            className={`${rowCheckbox} ${cardCheckbox}`}
            onClick={onToggleSelect}
          >
            {selected && <Check size={12} strokeWidth={3} aria-hidden />}
          </button>
        </div>
        <div className={cardMain}>
          <span className={cardTitle}>{item.title}</span>
          <span className={cardMeta}>
            <TypeBadge tone={plannerTypeBadgeTone(item.plannerType)}>
              {item.plannerType}
            </TypeBadge>
            {durationLabel && (
              <span className={cardMetaItem}>{durationLabel}</span>
            )}
            {deadlineLabel && (
              <span
                className={`${cardMetaItem} ${isOverdue ? cardMetaOverdue : ""}`}
              >
                {deadlineLabel}
              </span>
            )}
            {category && (
              <span className={cardMetaItem}>
                {category.color && (
                  <CategoryDot color={category.color} size={7} glow={false} />
                )}
                <span className={cardMetaCategoryName}>{category.name}</span>
              </span>
            )}
            <span className={cardMetaItem}>
              {showProgressInstead ? (
                <Caption className={cellProgressPct}>
                  {Math.round(goalProgress * 100)}%
                </Caption>
              ) : (
                <Caption>{statusLabel}</Caption>
              )}
            </span>
          </span>
        </div>
        <div className={cardSide}>
          {menu}
          <ChevronRight size={15} strokeWidth={2} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${tableRow} ${selected ? tableRowSelected : ""}`}
      onClick={onClick}
      role="button"
    >
      <div className={cellCheck} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${item.title}`}
          data-checked={selected ? "true" : undefined}
          className={rowCheckbox}
          onClick={onToggleSelect}
        >
          {selected && <Check size={11} strokeWidth={3} aria-hidden />}
        </button>
      </div>
      <div className={cellTitle}>
        <span className={titleText}>{item.title}</span>
      </div>
      <div>
        <TypeBadge tone={plannerTypeBadgeTone(item.plannerType)}>
          {item.plannerType}
        </TypeBadge>
      </div>
      <div className={cellMuted}>
        {remainingDuration != null
          ? remainingDuration > 0
            ? formatDurationCompact(remainingDuration)
            : "—"
          : formatDurationCompact(item.duration)}
      </div>
      <div className={cellMuted}>{item.priority}</div>
      <div className={`${cellMuted} ${isOverdue ? cellOverdue : ""}`}>
        {item.deadline ? format(new Date(item.deadline), "MMM d, yyyy") : "—"}
      </div>
      <div className={cellLocation}>
        {category ? (
          <>
            {category.color && (
              <CategoryDot color={category.color} size={8} glow={false} />
            )}
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {category.name}
            </span>
          </>
        ) : (
          <span style={{ color: vars.muted }}>—</span>
        )}
      </div>
      <div className={cellProgress}>
        {showProgressInstead ? (
          <Caption className={cellProgressPct}>
            {Math.round(goalProgress * 100)}%
          </Caption>
        ) : (
          <Caption>{statusLabel}</Caption>
        )}
      </div>
      <div className={rowActions}>
        {menu}
        <ChevronRight size={14} strokeWidth={2} />
      </div>
    </div>
  );
}
