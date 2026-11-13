"use client";

import { format } from "date-fns";
import { Combobox, DateTimePicker, FieldStack } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { formatDatetimeLocal, parseDatetimeLocal } from "@/utils/datetime";
import {
  parsePlanRecurrence,
  serializePlanRecurrence,
  type PlanRecurrenceRule,
} from "@/utils/planRecurrence";
import { useItem } from "../../ItemContext";
import { RuleRow } from "../RuleRow";

type RecurrencePreset = "none" | "daily" | "weekly" | "biweekly" | "monthly";

const PRESET_LABELS: Record<RecurrencePreset, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

function presetFromRule(rule: PlanRecurrenceRule | null): RecurrencePreset {
  if (!rule) return "none";
  if (rule.freq === "weekly") {
    return rule.interval === 2 ? "biweekly" : "weekly";
  }
  return rule.freq;
}

function ruleFromPreset(
  preset: RecurrencePreset,
  until: string | null,
): PlanRecurrenceRule | null {
  switch (preset) {
    case "none":
      return null;
    case "daily":
      return { freq: "daily", interval: 1, until };
    case "weekly":
      return { freq: "weekly", interval: 1, until };
    case "biweekly":
      return { freq: "weekly", interval: 2, until };
    case "monthly":
      return { freq: "monthly", interval: 1, until };
  }
}

function recurrenceSummary(
  preset: RecurrencePreset,
  rule: PlanRecurrenceRule | null,
): string {
  if (!rule) return "Does not repeat";
  const label = PRESET_LABELS[preset];
  return rule.until
    ? `${label} · until ${format(new Date(rule.until), "MMM d, yyyy")}`
    : label;
}

export function RecurrenceSection() {
  const { item, updateField } = useItem();
  const { weekStartDay } = useCalendarProvider();

  const rule = parsePlanRecurrence(item.recurrence);

  // Plans repeat by anchoring on `starts`; tasks and goals repeat flexibly —
  // one auto-placed occurrence per period (the whole subtree for a goal). All
  // edit `recurrence` here. Flexible recurrence is root-only: a nested value
  // would be inert, so subtasks hide the section.
  const isPlan = item.plannerType === "plan";
  if (!isPlan && item.parentId) return null;

  const preset = presetFromRule(rule);

  const applyRule = (next: PlanRecurrenceRule | null) => {
    updateField("recurrence", next ? serializePlanRecurrence(next) : null);
    if (!next) updateField("recurrenceExceptions", null);
    // Flexible recurrence and a deadline are mutually exclusive — each
    // occurrence derives its deadline from its own period end. Clearing here
    // keeps the hidden Deadline field from resurfacing stale.
    if (next && !isPlan && item.deadline) updateField("deadline", null);
  };

  return (
    <RuleRow
      label="Repeats"
      enabled={rule !== null}
      summary={recurrenceSummary(preset, rule)}
      onToggle={(checked) => {
        if (checked) {
          applyRule(ruleFromPreset("daily", null));
        } else {
          applyRule(null);
        }
      }}
    >
      <Combobox
        value={preset}
        options={(Object.keys(PRESET_LABELS) as RecurrencePreset[]).map(
          (key) => ({ value: key, label: PRESET_LABELS[key] }),
        )}
        onChange={(next) =>
          applyRule(ruleFromPreset(next, rule?.until ?? null))
        }
        width="150px"
        ariaLabel="Recurrence"
      />

      {rule && (
        <FieldStack label="Until (optional)" size="sm">
          <DateTimePicker
            value={formatDatetimeLocal(rule.until)}
            onChange={(v) =>
              applyRule({ ...rule, until: parseDatetimeLocal(v) || null })
            }
            weekStartsOn={weekStartDay}
            clearable={!!rule.until}
            ariaLabel="Repeat until"
          />
        </FieldStack>
      )}
    </RuleRow>
  );
}
