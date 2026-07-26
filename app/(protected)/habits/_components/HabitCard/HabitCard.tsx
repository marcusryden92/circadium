"use client";

import { useRouter } from "next/navigation";
import { Flame, Check, X } from "lucide-react";
import {
  Glass,
  Caption,
  CategoryDot,
  categoryColor as resolveCategoryColor,
} from "@/components/ui";
import { progressTrack } from "@/lib/theme";
import { parsePlanRecurrence } from "@/utils/planRecurrence";
import { parseAllowedTimes } from "@/utils/allowedTimes";
import type { Planner } from "@/types/prisma";
import type { HabitStats } from "@/utils/habits/habitStats";
import {
  card,
  head,
  title,
  meta,
  rateRow,
  meterTrack,
  meterFill,
  rateValue,
  statsRow,
  statChip,
  streakChip,
  historyStrip,
  historyCell,
} from "./HabitCard.css";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HISTORY_CELLS = 14;

function cadenceLabel(habit: Planner): string {
  const rule = parsePlanRecurrence(habit.recurrence) ?? {
    freq: "weekly" as const,
    interval: 1,
  };
  const interval = rule.interval > 1 ? rule.interval : 1;
  const unit =
    rule.freq === "daily" ? "day" : rule.freq === "weekly" ? "week" : "month";
  if (interval === 1) {
    return rule.freq === "daily"
      ? "Daily"
      : rule.freq === "weekly"
        ? "Weekly"
        : "Monthly";
  }
  return `Every ${interval} ${unit}s`;
}

function windowLabel(habit: Planner): string {
  const allowed = parseAllowedTimes(habit.allowedTimes);
  if (!allowed) return "Anytime";
  const parts: string[] = [];
  if (allowed.days && allowed.days.length) {
    parts.push(allowed.days.map((d) => DAY_ABBR[d]).join(", "));
  }
  if (allowed.ranges && allowed.ranges.length) {
    parts.push(
      allowed.ranges.map((r) => `${r.startTime}–${r.endTime}`).join(", "),
    );
  }
  return parts.length ? parts.join(" · ") : "Anytime";
}

export function HabitCard({
  habit,
  stats,
}: {
  habit: Planner;
  stats: HabitStats;
}) {
  const router = useRouter();
  const color = resolveCategoryColor({ color: habit.color ?? null });
  const ratePct = Math.round(stats.completionRate * 100);
  const cells = [...stats.history].slice(0, HISTORY_CELLS).reverse();

  const open = () => router.push(`/items/${habit.id}`);

  return (
    <Glass
      radius="lg"
      className={card}
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
      <div className={head}>
        <CategoryDot color={color} size={9} />
        <span className={title}>{habit.title}</span>
      </div>

      <div className={meta}>
        <Caption>{cadenceLabel(habit)}</Caption>
        <Caption>· {windowLabel(habit)}</Caption>
        <Caption>· {habit.duration}m</Caption>
      </div>

      <div className={rateRow}>
        <div className={`${progressTrack()} ${meterTrack}`}>
          <div
            className={meterFill}
            style={{
              width: `${ratePct}%`,
              background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
            }}
          />
        </div>
        <span className={rateValue}>{ratePct}%</span>
      </div>

      <div className={statsRow}>
        <span className={streakChip}>
          <Flame size={13} strokeWidth={2.2} /> {stats.currentStreak}
        </span>
        <span className={statChip}>
          <Check size={13} strokeWidth={2.2} /> {stats.completedCount}
        </span>
        <span className={statChip}>
          <X size={13} strokeWidth={2.2} /> {stats.missedCount}
        </span>
      </div>

      {cells.length > 0 && (
        <div className={historyStrip} aria-hidden="true">
          {cells.map((entry) => (
            <span key={entry.key} className={historyCell[entry.status]} />
          ))}
        </div>
      )}
    </Glass>
  );
}
