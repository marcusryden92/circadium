"use client";

import { RootState, AppDispatch } from "@/redux/store";
import { useMemo, useCallback } from "react";
import Link from "next/link";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useSelector, useDispatch } from "react-redux";
import { useItem } from "../_components/ItemContext";
import {
  dismissEngineMessage,
  undismissEngineMessage,
} from "@/redux/slices/engineOutputSlice";
import { formatLastRun } from "@/utils/timeFormatting";
import {
  toneColor,
  type ConsoleMessage,
} from "@/app/(protected)/calendar/_components/EngineConsole";
import {
  root,
  engineList,
  engineHeader,
  engineLastRun,
  engineCardContent,
  engineSummary,
  engineCardLink,
  engineCard,
  engineCardDismissed,
  engineDismissBtn,
  engineDismissedToggle,
  engineCardHead,
  engineTag,
  engineCardTitle,
  engineCardBody,
} from "./page.css";
import { RotateCcw, X } from "lucide-react";

import useRenderEngineMessages from "@/hooks/useRenderEngineMessage";

export default function ItemAlertsPage() {
  const { item } = useItem();
  const dispatch = useDispatch<AppDispatch>();
  const {
    planner,
    locations,
    queues,
    categories,
    engineMessages,
    calendarEvents,
  } = useCalendarProvider();
  const lastEngineRunAt = useSelector(
    (state: RootState) => state.engineOutput.lastEngineRunAt,
  );
  const { messages: renderedMessages, dismissed: dismissedMessages } =
    useRenderEngineMessages(
      planner,
      locations,
      queues,
      categories,
      engineMessages,
      item.id,
    );

  const handleDismiss = useCallback(
    (id: string) => dispatch(dismissEngineMessage(id)),
    [dispatch],
  );
  const handleRestore = useCallback(
    (id: string) => dispatch(undismissEngineMessage(id)),
    [dispatch],
  );

  const failCount = renderedMessages.filter((m) => m.tone === "fail").length;
  const warnCount = renderedMessages.filter((m) => m.tone === "warn").length;

  // Placed count is derived from live calendar state, not the SCHEDULED_OK
  // payload, so the header stays accurate after user edits (dismissed card,
  // pending regen). Both sources agree at emit time; only diverge in the
  // seam between an edit and the next regen.
  const placedCount = useMemo(
    () =>
      calendarEvents.filter((e) => e.extendedProps?.eventType === "planner")
        .length,
    [calendarEvents],
  );

  const renderCard = (m: ConsoleMessage, dismissed: boolean) => {
    const tc = toneColor(m.tone);
    return (
      <div
        key={m.id}
        className={
          dismissed ? `${engineCard} ${engineCardDismissed}` : engineCard
        }
        style={{
          borderColor: `color-mix(in srgb, ${tc} 60%, transparent)`,
        }}
      >
        {m.drillHref && (
          <Link
            href={m.drillHref}
            className={engineCardLink}
            aria-label={`Open ${m.title}`}
          >
            {m.title}
          </Link>
        )}

        {dismissed ? (
          <button
            type="button"
            className={engineDismissBtn}
            onClick={() => handleRestore(m.id)}
            aria-label="Restore message"
            title="Restore"
          >
            <RotateCcw size={13} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            type="button"
            className={engineDismissBtn}
            onClick={() => handleDismiss(m.id)}
            aria-label="Dismiss message"
            title="Dismiss"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
        <div className={engineCardContent}>
          <div className={engineCardHead}>
            <span className={engineTag} style={{ background: tc }}>
              {m.tag}
            </span>
            <span className={engineCardTitle}>{m.title}</span>
          </div>
          <div className={engineCardBody}>{m.body}</div>
        </div>
      </div>
    );
  };

  return (
    <div className={root}>
      <section>
        <div className={engineHeader}>
          <span className={engineLastRun}>
            last run · {formatLastRun(lastEngineRunAt)}
          </span>
          <div className={engineSummary}>
            {failCount} fail · {warnCount} warn · {placedCount} placed
          </div>
        </div>
        <div className={engineList}>
          {renderedMessages.map((m) => renderCard(m, false))}
          {dismissedMessages.length > 0 && (
            <div className={engineDismissedToggle}>
              Dismissed ({dismissedMessages.length})
            </div>
          )}
          {dismissedMessages.map((m) => renderCard(m, true))}
        </div>
      </section>
    </div>
  );
}
