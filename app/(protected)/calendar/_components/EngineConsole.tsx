"use client";

import { useState } from "react";
import Link from "next/link";
import { Locate, RotateCcw, X } from "lucide-react";
import { vars } from "@/components/ui";
import type { RenderedEngineMessage } from "@/utils/renderEngineMessage";
import type { EngineTone } from "@/utils/engineTones";
import { EngineControls } from "./EngineControls";
import { formatLastRun } from "@/utils/timeFormatting";
import {
  engineHeader,
  engineLastRun,
  engineSummary,
  engineList,
  engineCard,
  engineCardDismissed,
  engineCardHead,
  engineCardLink,
  engineCardContent,
  engineDismissBtn,
  engineDismissedToggle,
  engineGoToBtn,
  engineTag,
  engineCardTitle,
  engineCardBody,
} from "../page.css";

export type ConsoleMessage = RenderedEngineMessage & {
  // Prebuilt item deep-link, matching the calendar popover: a root planner
  // opens its item page, a subtask opens the root's subtasks tree focused on
  // it. Null when the payload references no planner.
  drillHref: string | null;
};

export function toneColor(tone: EngineTone) {
  switch (tone) {
    case "fail":
      return vars.status.error;
    case "warn":
      return vars.status.warning;
    case "done":
      return vars.status.success;
    case "info":
    default:
      return vars.status.info;
  }
}

type EngineConsoleProps = {
  messages: ConsoleMessage[];
  dismissedMessages: ConsoleMessage[];
  lastEngineRunAt: string | null;
  failCount: number;
  warnCount: number;
  placedCount: number;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onGoToDate: (iso: string) => void;
};

// Header + message list + tuning controls, container-agnostic: rendered
// inside the docked engine column on desktop and the mobile bottom sheet.
export function EngineConsole({
  messages,
  dismissedMessages,
  lastEngineRunAt,
  failCount,
  warnCount,
  placedCount,
  onDismiss,
  onRestore,
  onGoToDate,
}: EngineConsoleProps) {
  const [showDismissed, setShowDismissed] = useState(false);

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
        {m.goToDate && (
          <button
            type="button"
            className={engineGoToBtn}
            onClick={() => onGoToDate(m.goToDate!)}
            aria-label="Go to date in calendar"
            title="Go to date"
          >
            <Locate size={13} strokeWidth={2.2} />
          </button>
        )}
        {dismissed ? (
          <button
            type="button"
            className={engineDismissBtn}
            onClick={() => onRestore(m.id)}
            aria-label="Restore message"
            title="Restore"
          >
            <RotateCcw size={13} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            type="button"
            className={engineDismissBtn}
            onClick={() => onDismiss(m.id)}
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
    <>
      <div className={engineHeader}>
        <span className={engineLastRun}>
          last run · {formatLastRun(lastEngineRunAt)}
        </span>
        <div className={engineSummary}>
          {failCount} fail · {warnCount} warn · {placedCount} placed
        </div>
      </div>

      <div className={engineList}>
        {messages.map((m) => renderCard(m, false))}
        {dismissedMessages.length > 0 && (
          <button
            type="button"
            className={engineDismissedToggle}
            onClick={() => setShowDismissed((v) => !v)}
            aria-expanded={showDismissed}
          >
            {showDismissed
              ? "Hide dismissed"
              : `Show dismissed (${dismissedMessages.length})`}
          </button>
        )}
        {showDismissed && dismissedMessages.map((m) => renderCard(m, true))}
      </div>

      <EngineControls />
    </>
  );
}
