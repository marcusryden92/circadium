import { v4 as uuidv4 } from "uuid";
import type { PlanOccurrenceException } from "@/utils/planRecurrence";
import type { DraftOpFailure } from "./draftForestOps";
import {
  type DraftTemplate,
  MAX_TEMPLATE_DURATION_MINUTES,
  isValidColor,
  isValidStartDay,
  isValidTime,
} from "./draftTemplates";

// Deterministic operations on the assistant's working template list, executed
// server-side like draftForestOps: the model states intent, code performs the
// mutation. Templates are a small flat list, so every op returns the full
// next array and the route emits it wholesale — no partial-tree events.
// Overlapping templates are allowed (the engine surfaces overlap as a
// warning); ops never reject on geometry.

export interface DraftTemplateOpsResult {
  templates: DraftTemplate[];
  changed: boolean;
  failures: DraftOpFailure[];
}

export interface DraftTemplateUpdate {
  id: string;
  title?: string;
  startDay?: number;
  startTime?: string;
  duration?: number;
  color?: string | null;
  locationId?: string | null;
}

export function addDraftTemplates(
  templates: DraftTemplate[],
  items: unknown[],
  validLocationIds: ReadonlySet<string>,
): DraftTemplateOpsResult {
  const next = [...templates];
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "object" || raw === null) {
      failures.push({ id: null, reason: "template must be an object" });
      continue;
    }
    const obj = raw as Record<string, unknown>;

    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (title.length === 0) {
      failures.push({ id: null, reason: "title must be non-empty" });
      continue;
    }
    if (!isValidStartDay(obj.startDay)) {
      failures.push({
        id: null,
        reason: `"${title}": startDay must be an integer 0-6 (0 = Sunday)`,
      });
      continue;
    }
    if (!isValidTime(obj.startTime)) {
      failures.push({
        id: null,
        reason: `"${title}": startTime must be "HH:MM" (24h)`,
      });
      continue;
    }
    const duration = validateDuration(obj.duration);
    if (duration === null) {
      failures.push({
        id: null,
        reason: `"${title}": duration must be minutes between 1 and ${MAX_TEMPLATE_DURATION_MINUTES}`,
      });
      continue;
    }
    const color = validateColor(obj.color);
    if (color === undefined) {
      failures.push({
        id: null,
        reason: `"${title}": color must be a 6-digit hex string or null`,
      });
      continue;
    }
    const locationId = validateLocationId(obj.locationId, validLocationIds);
    if (locationId === undefined) {
      failures.push({ id: null, reason: `"${title}": unknown locationId` });
      continue;
    }

    // New templates are new by definition — any model-supplied id is
    // discarded and a fresh draft id minted (it becomes the DB id at Save).
    next.push({
      id: uuidv4(),
      title,
      startDay: obj.startDay,
      startTime: obj.startTime,
      duration,
      color,
      locationId,
      exceptions: [],
    });
    changed = true;
  }

  return { templates: next, changed, failures };
}

export function updateDraftTemplates(
  templates: DraftTemplate[],
  updates: DraftTemplateUpdate[],
  validLocationIds: ReadonlySet<string>,
): DraftTemplateOpsResult {
  const next = templates.map((t) => ({ ...t }));
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const target = next.find((t) => t.id === id);
    if (!target) {
      failures.push({ id: id || null, reason: "template not found" });
      continue;
    }
    const originalDay = target.startDay;
    const originalTime = target.startTime;

    if (update.title !== undefined) {
      if (typeof update.title !== "string" || update.title.trim().length === 0) {
        failures.push({ id, reason: "title must be non-empty" });
        continue;
      }
      target.title = update.title.trim();
    }
    if (update.startDay !== undefined) {
      if (!isValidStartDay(update.startDay)) {
        failures.push({
          id,
          reason: "startDay must be an integer 0-6 (0 = Sunday)",
        });
        continue;
      }
      target.startDay = update.startDay;
    }
    if (update.startTime !== undefined) {
      if (!isValidTime(update.startTime)) {
        failures.push({ id, reason: 'startTime must be "HH:MM" (24h)' });
        continue;
      }
      target.startTime = update.startTime;
    }
    if (update.duration !== undefined) {
      const duration = validateDuration(update.duration);
      if (duration === null) {
        failures.push({
          id,
          reason: `duration must be minutes between 1 and ${MAX_TEMPLATE_DURATION_MINUTES}`,
        });
        continue;
      }
      target.duration = duration;
    }
    if (update.color !== undefined) {
      const color = validateColor(update.color);
      if (color === undefined) {
        failures.push({
          id,
          reason: "color must be a 6-digit hex string or null",
        });
        continue;
      }
      target.color = color;
    }
    if (update.locationId !== undefined) {
      const locationId = validateLocationId(update.locationId, validLocationIds);
      if (locationId === undefined) {
        failures.push({ id, reason: "unknown locationId" });
        continue;
      }
      target.locationId = locationId;
    }

    // Re-anchoring the series makes the old occurrence keys meaningless
    // (ghost moved one-offs, resurrected deleted occurrences) — same rule the
    // Save apply enforces, surfaced here so the working state tells the truth.
    if (
      (target.startDay !== originalDay || target.startTime !== originalTime) &&
      target.exceptions.length > 0
    ) {
      target.exceptions = [];
    }

    changed = true;
  }

  return { templates: next, changed, failures };
}

export interface DraftTemplateExceptionEdit {
  templateId: string;
  // "YYYY-MM-DD" dates whose occurrence should be skipped.
  skip?: string[];
  // Per-occurrence moves: the occurrence on `date` starts at `newStart`
  // ("YYYY-MM-DDTHH:MM" local, any day) with an optional length override.
  move?: { date: string; newStart: string; durationMinutes?: number }[];
  // "YYYY-MM-DD" dates whose existing exception should be removed.
  restore?: string[];
}

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Seconds/millis are tolerated and truncated (models emit ISO-ish strings);
// an explicit timezone is refused — newStart is a local wall-clock time.
const LOCAL_DATETIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;

function normalizeLocalDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = LOCAL_DATETIME_PATTERN.exec(value);
  if (!match) return null;
  if (!parseLocalDate(match[1].slice(0, 10))) return null;
  return match[1];
}

function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Reject rollover dates like 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

// Mints the occurrence key for a template's occurrence on `date`, refusing
// dates that don't land on the template's weekday.
function occurrenceKeyForDate(
  template: DraftTemplate,
  rawDate: unknown,
): { key: string } | { error: string } {
  const date = parseLocalDate(rawDate);
  if (!date) return { error: `"${String(rawDate)}" is not a valid YYYY-MM-DD date` };
  if (date.getDay() !== template.startDay) {
    return {
      error: `${String(rawDate)} is a ${DAY_LABELS[date.getDay()]} but "${template.title}" runs on ${DAY_LABELS[template.startDay]}s`,
    };
  }
  return { key: `${String(rawDate)}T${template.startTime}` };
}

// Per-occurrence exception editing — skip, move, or restore specific dated
// occurrences of a weekly template. Keys are minted here from the template's
// CURRENT startTime, so exception edits after a same-turn re-time stay
// consistent with the re-anchored series.
export function updateDraftTemplateExceptions(
  templates: DraftTemplate[],
  edits: DraftTemplateExceptionEdit[],
): DraftTemplateOpsResult {
  const next = templates.map((t) => ({ ...t }));
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const edit of Array.isArray(edits) ? edits : []) {
    if (typeof edit !== "object" || edit === null) {
      failures.push({ id: null, reason: "edit must be an object" });
      continue;
    }
    const id = typeof edit.templateId === "string" ? edit.templateId : "";
    const target = next.find((t) => t.id === id);
    if (!target) {
      failures.push({ id: id || null, reason: "template not found" });
      continue;
    }

    const byKey = new Map(target.exceptions.map((e) => [e.key, e]));
    let touched = false;

    for (const rawDate of Array.isArray(edit.skip) ? edit.skip : []) {
      const minted = occurrenceKeyForDate(target, rawDate);
      if ("error" in minted) {
        failures.push({ id, reason: minted.error });
        continue;
      }
      byKey.set(minted.key, { key: minted.key, type: "deleted" });
      touched = true;
    }

    for (const rawMove of Array.isArray(edit.move) ? edit.move : []) {
      if (typeof rawMove !== "object" || rawMove === null) {
        failures.push({ id, reason: "move must be an object" });
        continue;
      }
      const minted = occurrenceKeyForDate(target, rawMove.date);
      if ("error" in minted) {
        failures.push({ id, reason: minted.error });
        continue;
      }
      const newStart = normalizeLocalDateTime(rawMove.newStart);
      if (newStart === null) {
        failures.push({
          id,
          reason: `move for ${String(rawMove.date)}: newStart must be "YYYY-MM-DDTHH:MM" local time (no timezone suffix)`,
        });
        continue;
      }
      let durationMinutes: number | undefined;
      if (rawMove.durationMinutes !== undefined) {
        if (
          typeof rawMove.durationMinutes !== "number" ||
          !isFinite(rawMove.durationMinutes) ||
          rawMove.durationMinutes < 1 ||
          rawMove.durationMinutes > MAX_TEMPLATE_DURATION_MINUTES
        ) {
          failures.push({
            id,
            reason: `move for ${String(rawMove.date)}: durationMinutes must be minutes between 1 and ${MAX_TEMPLATE_DURATION_MINUTES}`,
          });
          continue;
        }
        durationMinutes = Math.floor(rawMove.durationMinutes);
      }
      const moved: PlanOccurrenceException = {
        key: minted.key,
        type: "moved",
        newStart,
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      };
      byKey.set(minted.key, moved);
      touched = true;
    }

    for (const rawDate of Array.isArray(edit.restore) ? edit.restore : []) {
      const minted = occurrenceKeyForDate(target, rawDate);
      if ("error" in minted) {
        failures.push({ id, reason: minted.error });
        continue;
      }
      if (!byKey.has(minted.key)) {
        failures.push({
          id,
          reason: `no exception on ${String(rawDate)} to restore`,
        });
        continue;
      }
      byKey.delete(minted.key);
      touched = true;
    }

    if (touched) {
      target.exceptions = [...byKey.values()];
      changed = true;
    }
  }

  return { templates: next, changed, failures };
}

export function deleteDraftTemplates(
  templates: DraftTemplate[],
  templateIds: string[],
): DraftTemplateOpsResult {
  const ids = [...new Set(templateIds.filter((id) => typeof id === "string"))];
  const failures: DraftOpFailure[] = [];
  const present = new Set(templates.map((t) => t.id));

  for (const id of ids) {
    if (!present.has(id)) {
      failures.push({ id, reason: "template not found" });
    }
  }

  const remove = new Set(ids);
  const next = templates.filter((t) => !remove.has(t.id));
  return {
    templates: next,
    changed: next.length !== templates.length,
    failures,
  };
}

// Sub-minute values floor up to 1 (same coercion as updateDraftItems);
// anything past a full week is a model mistake, not a preference.
function validateDuration(value: unknown): number | null {
  if (typeof value !== "number" || !isFinite(value)) return null;
  const floored = Math.floor(value);
  if (floored > MAX_TEMPLATE_DURATION_MINUTES) return null;
  return Math.max(1, floored);
}

// undefined = invalid; string | null = accepted value.
function validateColor(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return isValidColor(value) ? value : undefined;
}

function validateLocationId(
  value: unknown,
  validLocationIds: ReadonlySet<string>,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && validLocationIds.has(value)) return value;
  return undefined;
}
