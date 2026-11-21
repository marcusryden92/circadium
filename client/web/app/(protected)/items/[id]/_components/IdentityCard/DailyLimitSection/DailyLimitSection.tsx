"use client";

import { DurationField, FieldStack } from "@/components/ui";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import { useItem } from "../../ItemContext";
import { RuleRow } from "../RuleRow";

const DEFAULT_DAILY_LIMIT_MINUTES = 120;

export function DailyLimitSection() {
  const { item, updateField } = useItem();

  // The cap belongs to the goal root — the engine reads it off the root
  // candidate and meters the whole subtree against one per-day ledger.
  if (item.plannerType !== "goal" || item.parentId) return null;

  const limit = item.maxMinutesPerDay;
  const enabled = typeof limit === "number" && limit > 0;

  return (
    <RuleRow
      label="Daily limit"
      enabled={enabled}
      summary={enabled ? `${formatMinutesToHours(limit)} per day` : "Off"}
      onToggle={(checked) =>
        updateField(
          "maxMinutesPerDay",
          checked ? DEFAULT_DAILY_LIMIT_MINUTES : null,
        )
      }
    >
      {enabled && (
        <FieldStack label="Max per day" size="sm">
          <DurationField
            minutes={limit}
            minMinutes={5}
            ariaLabel="Daily limit"
            onCommit={(minutes) => updateField("maxMinutesPerDay", minutes)}
          />
        </FieldStack>
      )}
    </RuleRow>
  );
}
