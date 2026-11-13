"use client";

import { space } from "@/lib/theme";
import { DateTimePicker, FieldStack } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { formatDatetimeLocal } from "@/utils/datetime";
import { useItem } from "../../ItemContext";

export function EarliestStartSection() {
  const { item, updateField } = useItem();
  const { weekStartDay } = useCalendarProvider();

  return (
    <FieldStack label="Earliest start" disabled={item.plannerType === "plan"}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["1"],
          maxWidth: "220px",
        }}
      >
        <DateTimePicker
          value={formatDatetimeLocal(item.earliestStartDate)}
          onChange={(v) =>
            updateField(
              "earliestStartDate",
              v ? new Date(v).toISOString() : null,
            )
          }
          weekStartsOn={weekStartDay}
          ariaLabel="Earliest start"
        />
      </div>
    </FieldStack>
  );
}
