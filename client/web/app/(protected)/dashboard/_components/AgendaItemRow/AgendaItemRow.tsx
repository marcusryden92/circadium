import { ChevronRight } from "lucide-react";
import { Caption } from "@/components/ui";
import { listRow } from "@/lib/theme";
import {
  formatDurationCompact,
  formatTimeOfDay,
} from "@/utils/timeFormatting";
import type { AgendaItem } from "../../_data/types";
import {
  agendaRow,
  agendaRowGrouped,
  agendaTimeCol,
  agendaTime,
  agendaDur,
  agendaTitle,
  agendaMeta,
  agendaMetaDimmer,
} from "../agendaRow.css";
import {
  agendaRowNow,
  agendaRowNext,
  agendaRowTravel,
  agendaTitleTravel,
  agendaWarn,
  agendaOverdue,
  agendaChevron,
  rowLabel,
  rowLabelNow,
  rowLabelNext,
  rowLabelDetail,
} from "./AgendaItemRow.css";

type Props = {
  item: AgendaItem;
  onClick?: (plannerId: string) => void;
};

export function AgendaItemRow({ item, onClick }: Props) {
  const plannerId = !item.travel ? item.plannerId : undefined;
  const interactive = plannerId !== undefined;
  const handleClick = plannerId ? () => onClick?.(plannerId) : undefined;

  const rowClass = [
    listRow(),
    agendaRow,
    item.now ? agendaRowNow : "",
    item.next ? agendaRowNext : "",
    item.travel ? agendaRowTravel : "",
    agendaRowGrouped,
  ]
    .filter(Boolean)
    .join(" ");

  const showFixedCaption = item.kind === "plan";
  const hasMetaRow =
    !!item.where ||
    showFixedCaption ||
    item.warn ||
    item.overdue ||
    item.pastDeadline;

  const durationLabel =
    item.durationMinutes > 0 ? formatDurationCompact(item.durationMinutes) : "0m";

  return (
    <>
      {item.now && (
        <div className={`${rowLabel} ${rowLabelNow}`}>NOW</div>
      )}
      {item.next && (
        <div className={`${rowLabel} ${rowLabelNext}`}>
          NEXT
          {item.startsInMinutes !== undefined && (
            <span className={rowLabelDetail}>
              starts in {formatDurationCompact(item.startsInMinutes)}
            </span>
          )}
        </div>
      )}
      <div
      className={rowClass}
      onClick={handleClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick?.();
              }
            }
          : undefined
      }
    >
      <div className={agendaTimeCol}>
        <div className={agendaTime}>{formatTimeOfDay(item.start)}</div>
        <div className={agendaDur}>{durationLabel}</div>
      </div>

      <div>
        <div
          className={`${agendaTitle} ${item.travel ? agendaTitleTravel : ""}`}
        >
          {item.title}
        </div>
        {hasMetaRow && (
          <div className={agendaMeta}>
            {item.where && <Caption>{item.where}</Caption>}
            {showFixedCaption && (
              <Caption className={agendaMetaDimmer}>· fixed</Caption>
            )}
            {item.warn && <span className={agendaWarn}>LATE</span>}
            {item.overdue && <span className={agendaOverdue}>OVERDUE</span>}
            {item.pastDeadline && !item.overdue && (
              <span className={agendaOverdue}>PAST DEADLINE</span>
            )}
          </div>
        )}
      </div>

      {interactive ? (
        <span className={agendaChevron} aria-hidden>
          <ChevronRight size={16} strokeWidth={2} />
        </span>
      ) : (
        <span />
      )}
      </div>
    </>
  );
}
