import Link from "next/link";
import { Button } from "@/components/ui";
import { formatDurationCompact } from "@/utils/timeFormatting";
import type { DashboardSummary } from "../../_data/types";
import {
  headerRow,
  titleContainer,
  greeting,
  summaryLine,
  summaryStrong,
  summaryError,
  headerActions,
  openCalendarLink,
  routeName,
} from "./DashboardHeader.css";
import { mobileGuard, mobileLandscapeGuard } from "@/lib/theme";
import clsx from "clsx";

type Props = {
  greetingText: string;
  dateText: string;
  summary: DashboardSummary;
};

export function DashboardHeader({ greetingText, dateText, summary }: Props) {
  const plannedLabel =
    summary.plannedMinutes > 0
      ? formatDurationCompact(summary.plannedMinutes)
      : "0m";

  return (
    <div className={headerRow}>
      <div className={titleContainer}>
        <span className={clsx(routeName, mobileLandscapeGuard)}>Dashboard</span>
        <h1 className={greeting}>{greetingText}</h1>
        <div className={summaryLine}>
          <span className={summaryStrong}>{dateText}</span>
          {" · "}
          <span className={summaryStrong}>{summary.itemCount}</span>
          {summary.itemCount === 1 ? " thing on today" : " things on today"}
          {" · "}
          <span className={summaryStrong}>{plannedLabel}</span>
          {" planned"}
          {summary.overdueCount > 0 && (
            <>
              {" · "}
              <span className={summaryError}>
                {summary.overdueCount} overdue
              </span>
            </>
          )}
          {summary.pastDeadlineCount > 0 && (
            <>
              {" · "}
              {summary.pastDeadlineCount} scheduled past deadline
            </>
          )}
        </div>
      </div>
      <div className={clsx(headerActions, mobileGuard)}>
        <Link href="/calendar" className={openCalendarLink}>
          <Button variant="solid">Open calendar →</Button>
        </Link>
      </div>
    </div>
  );
}
