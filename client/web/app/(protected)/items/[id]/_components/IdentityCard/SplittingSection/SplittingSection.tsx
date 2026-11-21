"use client";

import {
  SplittingFields,
  DEFAULT_SPLITTING_SETTINGS,
} from "@/components/tasks/SplittingFields";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import {
  parseTaskSplitting,
  serializeTaskSplitting,
  splitCompletedMinutes,
  splitMaxIsUnlimited,
  type TaskSplittingSettings,
} from "@/utils/taskSplitting";
import { useItem } from "../../ItemContext";
import { RuleRow } from "../RuleRow";

function splittingSummary(settings: TaskSplittingSettings): string {
  const parts = [
    `${formatMinutesToHours(settings.minMinutes)}–${
      splitMaxIsUnlimited(settings)
        ? "∞"
        : formatMinutesToHours(settings.maxMinutes)
    }`,
  ];
  if (settings.maxMinutesPerDay !== null) {
    parts.push(`≤ ${formatMinutesToHours(settings.maxMinutesPerDay)}/day`);
  }
  if (settings.minSpacingMinutes != null) {
    parts.push(`${formatMinutesToHours(settings.minSpacingMinutes)} gap`);
  }
  return parts.join(" · ");
}

export function SplittingSection() {
  const { item, updateField } = useItem();

  // Splittable = a task the scheduler places as a single block. Plans are
  // fixed anchors and goals are containers (their leaf tasks get split, not the
  // container), so chunking is exposed on task-typed rows only. Goal subtree
  // leaves get the same control in the subtask EditDrawer.
  if (item.plannerType !== "task") return null;

  const settings = parseTaskSplitting(item.splitting);
  const completed = splitCompletedMinutes(item);

  const apply = (next: TaskSplittingSettings | null) => {
    // Disabling keeps completedSegments on the row — the segments go inert
    // (no events, no completion effect) but re-enabling restores the credit.
    updateField("splitting", next ? serializeTaskSplitting(next) : null);
  };

  return (
    <RuleRow
      label="Split into chunks"
      enabled={settings !== null}
      summary={settings ? splittingSummary(settings) : "Off"}
      onToggle={(checked) =>
        apply(checked ? DEFAULT_SPLITTING_SETTINGS : null)
      }
    >
      {settings && (
        <SplittingFields
          settings={settings}
          duration={item.duration}
          completed={completed}
          onChange={apply}
        />
      )}
    </RuleRow>
  );
}
