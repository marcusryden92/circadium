"use client";

import { FieldStack } from "@/components/ui";
import { PRIORITY_LEVELS } from "@/utils/plannerPriority";
import { useItem } from "../../ItemContext";
import { priorityRow, priorityPill } from "./PrioritySection.css";

// Plans are fixed-time — the engine never scores them, so the field ghosts
// instead of unmounting (keeps the grid stable across type switches).
export function PrioritySection() {
  const { item, updateField } = useItem();

  return (
    <FieldStack label="Priority" disabled={item.plannerType === "plan"}>
      <div className={priorityRow}>
        {PRIORITY_LEVELS.map((p) => (
          <button
            key={p}
            type="button"
            className={priorityPill}
            aria-pressed={item.priority === p}
            onClick={() => updateField("priority", p)}
            aria-label={`Priority ${p}`}
          >
            {p}
          </button>
        ))}
      </div>
    </FieldStack>
  );
}
