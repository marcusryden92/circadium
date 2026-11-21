"use client";

import { space } from "@/lib/theme";
import { DateTimePicker, FieldStack } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { formatDatetimeLocal } from "@/utils/datetime";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import { useItem } from "../../ItemContext";

export function DateSection() {
  const { item, changeDate } = useItem();
  const { weekStartDay } = useCalendarProvider();
  // A flexibly recurring item has no user-facing deadline — each occurrence
  // is bounded to its own period internally; a "Deadline" field here would be
  // meaningless (and RecurrenceSection clears it on enable).
  if (plannerHasFlexibleRecurrence(item)) return null;
  const isPlan = item.plannerType === "plan";
  const isoValue = isPlan ? item.starts : item.deadline;
  const dateValue = formatDatetimeLocal(isoValue);

  return (
    <FieldStack label={isPlan ? "Scheduled" : "Deadline"}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["1"],
          maxWidth: "220px",
        }}
      >
        <DateTimePicker
          value={dateValue}
          onChange={(v) => changeDate(v ? new Date(v) : undefined)}
          weekStartsOn={weekStartDay}
          ariaLabel={isPlan ? "Scheduled time" : "Deadline"}
        />
      </div>
    </FieldStack>
  );
}
