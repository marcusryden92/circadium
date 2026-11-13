"use client";

import { RecurrenceExceptionList } from "@/components/events/RecurrenceExceptionList";
import {
  parseRecurrenceExceptions,
  serializeRecurrenceExceptions,
  removeException,
  planIsRecurring,
} from "@/utils/planRecurrence";
import { useItem } from "../ItemContext";
import { card, cardTitle } from "./RecurrenceExceptionsCard.css";

export function RecurrenceExceptionsCard() {
  const { item, updateField } = useItem();

  if (item.plannerType !== "plan" || !planIsRecurring(item)) return null;

  const exceptions = parseRecurrenceExceptions(item.recurrenceExceptions);
  if (exceptions.length === 0) return null;

  const restore = (key: string) => {
    updateField(
      "recurrenceExceptions",
      serializeRecurrenceExceptions(removeException(exceptions, key)),
    );
  };

  return (
    <div className={card}>
      <div className={cardTitle}>Exceptions</div>
      <RecurrenceExceptionList exceptions={exceptions} onRestore={restore} />
    </div>
  );
}
