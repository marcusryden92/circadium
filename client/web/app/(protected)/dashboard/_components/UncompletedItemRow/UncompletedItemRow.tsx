import { Redo, Check } from "lucide-react";
import { Button, Caption } from "@/components/ui";
import { listRow } from "@/lib/theme";
import type { UncompletedItem } from "../../_data/types";
import type { FlashTone } from "../../_hooks/useFlashAction";
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
  mobileButton,
  uncompletedRow,
  uncompletedDaysLabel,
  uncompletedActions,
  uncompletedRowFlashSuccess,
  uncompletedRowFlashInfo,
  actionIcon,
} from "./UncompletedItemRow.css";
import { mobileGuard } from "@/lib/theme";

type Props = {
  item: UncompletedItem;
  flash: FlashTone | null;
  onOpen: (plannerId: string) => void;
  onComplete: () => void;
  onPostpone: () => void;
};

export function UncompletedItemRow({
  item,
  flash,
  onOpen,
  onComplete,
  onPostpone,
}: Props) {
  const rowClass = [
    listRow(),
    agendaRow,
    agendaRowGrouped,
    uncompletedRow,
    flash === "success" ? uncompletedRowFlashSuccess : "",
    flash === "info" ? uncompletedRowFlashInfo : "",
  ]
    .filter(Boolean)
    .join(" ");

  const open = () => onOpen(item.plannerId);

  return (
    <div
      className={rowClass}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className={agendaTimeCol}>
        <div className={`${agendaTime} ${uncompletedDaysLabel}`}>
          {item.daysAgo === 0 ? "today" : `${item.daysAgo}d`}
        </div>
        <div className={agendaDur}>
          {item.daysAgo === 0 ? "missed" : "late"}
        </div>
      </div>

      <div>
        <div className={agendaTitle}>{item.title}</div>
        <div className={agendaMeta}>
          <Caption>{item.kind}</Caption>
          {item.categoryName && (
            <Caption className={agendaMetaDimmer}>
              · {item.categoryName}
            </Caption>
          )}
        </div>
      </div>

      <div className={uncompletedActions}>
        <Button
          variant="glass"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          aria-label="Mark complete"
          title="Mark complete"
          className={mobileButton}
        >
          <span className={mobileGuard}>Complete</span>
          <Check size={13} strokeWidth={2.2} className={actionIcon} />
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onPostpone();
          }}
          aria-label="Postpone"
          title="Postpone"
          className={mobileButton}
        >
          <span className={mobileGuard}>Postpone</span>
          <Redo size={13} strokeWidth={2} className={actionIcon} />
        </Button>
      </div>
    </div>
  );
}
