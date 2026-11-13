import type { PlanOccurrenceException } from "@/utils/planRecurrence";

export type PerTemplateMask = {
  templateId: string;
  title?: string;
  color?: string;
  locationId?: string | null;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number; // may exceed 1440 for midnight-crossing templates
  startDateISO?: string;
  intervalDays?: number;
  // Per-occurrence moved/deleted overrides keyed by the occurrence's original
  // local start (occurrenceKey). Applied per matching day in masksToIntervals.
  recurrenceExceptions?: PlanOccurrenceException[];
};
