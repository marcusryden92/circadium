import type { EventTemplate } from "@/types/prisma";
import {
  parseRecurrenceExceptions,
  type PlanOccurrenceException,
} from "@/utils/planRecurrence";

// The assistant's contract for weekly recurring templates. A trimmed mirror
// of EventTemplate: userId and timestamps are server concerns re-attached at
// Save, never shown to the model or held in draft state.
export interface DraftTemplate {
  // Route-minted uuid for new rows; becomes the real DB id at Save.
  id: string;
  title: string;
  // 0-6, 0 = Sunday (matches WeekDayIntegers / Date.getDay()).
  startDay: number;
  // "HH:MM", 24h.
  startTime: string;
  // Minutes. Blocks spanning midnight keep their start day and run past it.
  duration: number;
  color: string | null;
  // null = "Anywhere".
  locationId: string | null;
  // Per-occurrence moved/deleted overrides, keyed by the occurrence's
  // original local start (the same PlanOccurrenceException shape the calendar
  // scope prompts write). Re-anchoring the series (day/startTime) clears them.
  exceptions: PlanOccurrenceException[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const MAX_TEMPLATE_DURATION_MINUTES = 7 * 24 * 60;

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function isValidStartDay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function isValidColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}

export function templatesToDraft(templates: EventTemplate[]): DraftTemplate[] {
  return templates.map((t) => ({
    id: t.id,
    title: t.title,
    startDay: t.startDay,
    startTime: t.startTime,
    duration: t.duration,
    color: t.color ?? null,
    locationId: t.locationId ?? null,
    exceptions: parseRecurrenceExceptions(t.recurrenceExceptions),
  }));
}

// Same validation as parseRecurrenceExceptions but over an already-parsed
// array (the `templates` events carry exceptions as objects, not JSON).
export function normalizeExceptionList(raw: unknown): PlanOccurrenceException[] {
  if (!Array.isArray(raw)) return [];
  try {
    return parseRecurrenceExceptions(JSON.stringify(raw));
  } catch {
    return [];
  }
}

export function normalizeDraftTemplate(raw: unknown): DraftTemplate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.length === 0) return null;
  if (typeof obj.title !== "string") return null;
  if (!isValidStartDay(obj.startDay)) return null;
  if (!isValidTime(obj.startTime)) return null;
  if (typeof obj.duration !== "number" || !isFinite(obj.duration)) return null;
  return {
    id: obj.id,
    title: obj.title,
    startDay: obj.startDay,
    startTime: obj.startTime,
    duration: Math.max(1, Math.floor(obj.duration)),
    color: isValidColor(obj.color) ? obj.color : null,
    locationId:
      typeof obj.locationId === "string" && obj.locationId.length > 0
        ? obj.locationId
        : null,
    exceptions: normalizeExceptionList(obj.exceptions),
  };
}

export function normalizeDraftTemplates(raw: unknown): DraftTemplate[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const list = (raw as { templates?: unknown }).templates;
  if (!Array.isArray(list)) return null;
  return list
    .map((entry) => normalizeDraftTemplate(entry))
    .filter((t): t is DraftTemplate => t !== null);
}

// Order-insensitive by key: exceptions are a keyed set, and the JSON column
// they round-trip through has no semantic order.
export function exceptionListsEqual(
  a: PlanOccurrenceException[],
  b: PlanOccurrenceException[],
): boolean {
  if (a.length !== b.length) return false;
  const byKey = new Map(b.map((e) => [e.key, e]));
  if (byKey.size !== b.length) return false;
  return a.every((e) => {
    const other = byKey.get(e.key);
    if (!other || other.type !== e.type) return false;
    if (e.type === "moved" && other.type === "moved") {
      return (
        e.newStart === other.newStart &&
        (e.durationMinutes ?? null) === (other.durationMinutes ?? null)
      );
    }
    return true;
  });
}

function draftTemplateEquals(a: DraftTemplate, b: DraftTemplate): boolean {
  return (
    a.title === b.title &&
    a.startDay === b.startDay &&
    a.startTime === b.startTime &&
    a.duration === b.duration &&
    a.color === b.color &&
    a.locationId === b.locationId &&
    exceptionListsEqual(a.exceptions, b.exceptions)
  );
}

// Order-insensitive: template array order is not semantic (sync diffs by id).
export function draftTemplatesEqual(
  a: DraftTemplate[],
  b: DraftTemplate[],
): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((t) => [t.id, t]));
  if (byId.size !== b.length) return false;
  return a.every((t) => {
    const other = byId.get(t.id);
    return other !== undefined && draftTemplateEquals(t, other);
  });
}
