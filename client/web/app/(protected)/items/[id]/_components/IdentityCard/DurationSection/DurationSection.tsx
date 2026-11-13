"use client";

import { DurationField, FieldStack, FieldValue } from "@/components/ui";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import { useItem } from "../../ItemContext";

export function DurationSection() {
  const { item, totalDuration, updateField } = useItem();
  const isGoal = item.plannerType === "goal";

  return (
    <FieldStack label={isGoal ? "Total duration" : "Duration"}>
      {isGoal ? (
        <FieldValue>{formatMinutesToHours(totalDuration)}</FieldValue>
      ) : (
        <DurationField
          minutes={item.duration}
          minMinutes={1}
          ariaLabel="Duration"
          onCommit={(minutes) => updateField("duration", minutes)}
        />
      )}
    </FieldStack>
  );
}
