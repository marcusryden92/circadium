/**
 * renderEngineMessage
 *
 * Adapts a structured EngineMessage (with typed payload) into the
 * presentation-level shape the calendar engine console renders. Kept
 * separate from the engine's emit code so:
 *   - Titles/bodies stay derived from current entity state (a rename
 *     doesn't leave a stale title on a persisted message).
 *   - A future action layer can hang off `type` + payload without
 *     re-parsing prose.
 */

import type { Category, Planner, EngineMessage, Queue } from "@/types/prisma";
import type { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";
import type {
  EngineMessagePayload,
  EngineMessageTone,
} from "./calendar-generation/models/EngineMessage";
import { SchedulingFailureReason } from "./calendar-generation/constants";
import { buildCategoryEligibilityMap } from "./calendar-generation/helpers/CalendarGenerator/buildCategoryEligibilityMap";
import {
  type AllowedTimesSettings,
  parseAllowedTimes,
} from "./allowedTimes";

export type RenderedEngineMessage = {
  id: string;
  tag: string;
  tone: EngineMessageTone;
  title: string;
  body: string;
  // ISO datetime when the card references a specific placement the calendar
  // can jump to; null for types without a concrete date (recurring travel
  // patterns, unplaced tasks, aggregate summaries).
  goToDate: string | null;
};

export type EngineMessageLookups = {
  plannerById: Map<string, Planner>;
  locationById: Map<string, SerializedLocation>;
  queueById: Map<string, Queue>;
  categoryById: Map<string, Category>;
};

export function buildEngineMessageLookups(
  planners: Planner[],
  locations: SerializedLocation[],
  queues: Queue[] = [],
  categories: Category[] = [],
): EngineMessageLookups {
  return {
    plannerById: new Map(planners.map((p) => [p.id, p])),
    locationById: new Map(locations.map((l) => [l.id, l])),
    queueById: new Map(queues.map((q) => [q.id, q])),
    categoryById: new Map(categories.map((c) => [c.id, c])),
  };
}

export function renderEngineMessage(
  message: EngineMessage,
  lookups: EngineMessageLookups,
): RenderedEngineMessage | null {
  // payload is Prisma.JsonValue in the DB. Guard the JSON shape first, then
  // narrow via the discriminant. An unknown or malformed shape (e.g. row
  // written by a newer client) returns null so the caller filters rather
  // than crashes.
  const raw = message.payload as unknown;
  if (!raw || typeof raw !== "object" || !("type" in raw)) return null;
  const knownTypes: readonly EngineMessagePayload["type"][] = [
    "TASK_TOO_LARGE",
    "TASK_UNSCHEDULABLE",
    "SCHEDULED_LATE",
    "INSUFFICIENT_TRAVEL",
    "SPLIT_CONSTRAINT_RELAXED",
    "GOAL_DAY_CAP_RELAXED",
    "QUEUE_SEQUENCE_BROKEN",
    "DEPENDENCY_BROKEN",
    "SEQUENCE_PAST_HORIZON",
    "SCHEDULED_OK",
  ];
  const rawType = (raw as { type: unknown }).type;
  if (
    typeof rawType !== "string" ||
    !knownTypes.includes(rawType as EngineMessagePayload["type"])
  ) {
    return null;
  }
  const payload = raw as EngineMessagePayload;
  const tone = message.tone as EngineMessageTone;

  // A dependency endpoint may be an interior node (node-level edges): append
  // the containing root as context so a subtask reads as a step of its goal.
  const plannerLabel = (id: string, fallback: string): string => {
    const row = lookups.plannerById.get(id);
    if (!row) return fallback;
    if (!row.parentId) return `"${row.title}"`;
    const seen = new Set<string>([row.id]);
    let current = row;
    while (current.parentId) {
      const parent = lookups.plannerById.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current.id === row.id
      ? `"${row.title}"`
      : `"${row.title}" (a step of "${current.title}")`;
  };

  switch (payload.type) {
    case "TASK_TOO_LARGE": {
      const planner = lookups.plannerById.get(payload.plannerId);
      const title = planner
        ? `Couldn't place: "${planner.title}"`
        : `Couldn't place task`;
      return {
        id: message.id,
        tag: "TOO LARGE",
        tone,
        title,
        body: tooLargeBody(payload, planner, lookups),
        goToDate: null,
      };
    }

    case "TASK_UNSCHEDULABLE": {
      const planner = lookups.plannerById.get(payload.plannerId);
      const isPartial =
        typeof payload.remainingMinutes === "number" &&
        payload.remainingMinutes > 0;
      const title = planner
        ? isPartial
          ? `Couldn't fully place: "${planner.title}"`
          : `Couldn't place: "${planner.title}"`
        : `Couldn't place task`;
      const partialNote = isPartial
        ? ` ${formatMinutes(payload.remainingMinutes!)} still unplaced${
            typeof payload.placedMinutes === "number" &&
            payload.placedMinutes > 0
              ? ` (${formatMinutes(payload.placedMinutes)} placed)`
              : ""
          }.`
        : "";
      const body =
        payload.reason === SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS &&
        planner
          ? impossibleConstraintsBody(planner, lookups)
          : unschedulableBody(payload.reason);
      return {
        id: message.id,
        tag: "UNPLACED",
        tone,
        title,
        body: `${body}${partialNote}`,
        goToDate: null,
      };
    }

    case "SCHEDULED_LATE": {
      const planner = lookups.plannerById.get(payload.plannerId);
      const label = planner?.title ?? "Task";
      const title = `"${label}" scheduled ${payload.daysLate} day${payload.daysLate === 1 ? "" : "s"} after deadline`;
      const scheduledLabel = formatDateLabel(payload.scheduledStart);
      const dueLabel = formatDateLabel(payload.deadline);
      const body = `Scheduled ${scheduledLabel}. Deadline was ${dueLabel}.`;
      return {
        id: message.id,
        tag: "LATE",
        tone,
        title,
        body,
        goToDate: payload.scheduledStart,
      };
    }

    case "INSUFFICIENT_TRAVEL": {
      const from = locationLabel(payload.fromLocationId, lookups);
      const to = locationLabel(payload.toLocationId, lookups);
      const dayLabel = weekdayLabel(payload.dayOfWeek);
      const title = `Insufficient travel · ${from} → ${to} · ${dayLabel} ${payload.timeOfDay}`;
      const scale =
        payload.affectedCount > 1
          ? ` Recurs ${payload.affectedCount}× in the horizon.`
          : "";
      const body = `Short by ${formatMinutes(payload.shortageMinutes)} (placed ${formatMinutes(payload.actualMinutes)}, needs ${formatMinutes(payload.requiredMinutes)}).${scale}`;
      return {
        id: message.id,
        tag: "TRAVEL",
        tone,
        title,
        body,
        goToDate: null,
      };
    }

    case "SPLIT_CONSTRAINT_RELAXED": {
      const planner = lookups.plannerById.get(payload.plannerId);
      const label = planner?.title ?? "Split task";
      const chunkLabel =
        payload.affectedCount === 1
          ? "one chunk"
          : `${payload.affectedCount} chunks`;
      const body =
        payload.kind === "maxChunk"
          ? `The remainder couldn't be divided without going below the minimum chunk size, so ${chunkLabel} (${formatMinutes(payload.totalMinutes)}) exceeds the maximum chunk size.`
          : `There wasn't room within the daily limit, so ${chunkLabel} (${formatMinutes(payload.totalMinutes)}) was placed past it rather than dropped.`;
      return {
        id: message.id,
        tag: "SPLIT",
        tone,
        title: `"${label}" placed with a compromise`,
        body,
        goToDate: null,
      };
    }

    case "GOAL_DAY_CAP_RELAXED": {
      const planner = lookups.plannerById.get(payload.plannerId);
      const label = planner?.title ?? "Goal";
      const blockLabel =
        payload.affectedCount === 1
          ? "one work block"
          : `${payload.affectedCount} work blocks`;
      const body =
        payload.kind === "oversizedLeaf"
          ? `A single work block needs more than the ${formatMinutes(payload.capMinutes)}/day limit, so ${blockLabel} (${formatMinutes(payload.totalMinutes)}) was placed whole.`
          : `There wasn't room within the ${formatMinutes(payload.capMinutes)}/day limit before the horizon ran out, so ${blockLabel} (${formatMinutes(payload.totalMinutes)}) was placed past it rather than dropped.`;
      return {
        id: message.id,
        tag: "DAILY LIMIT",
        tone,
        title: `"${label}" placed over its daily limit`,
        body,
        goToDate: null,
      };
    }

    case "QUEUE_SEQUENCE_BROKEN": {
      const queue = lookups.queueById.get(payload.queueId);
      const failed = lookups.plannerById.get(payload.failedPlannerId);
      const queueLabel = queue ? `"${queue.title}"` : "a queue";
      const failedLabel = failed ? `"${failed.title}"` : "an item";
      return {
        id: message.id,
        tag: "QUEUE",
        tone,
        title: `Order broken in ${queueLabel}`,
        body: `${failedLabel} couldn't be placed, so later items in the queue were scheduled without waiting for it.`,
        goToDate: null,
      };
    }

    case "DEPENDENCY_BROKEN": {
      const predecessorLabel = plannerLabel(
        payload.predecessorId,
        "a prerequisite",
      );
      const successorLabel = plannerLabel(payload.successorId, "An item");
      const reason =
        payload.cause === "unready"
          ? `${predecessorLabel} isn't marked ready yet`
          : `${predecessorLabel} couldn't be placed`;
      return {
        id: message.id,
        tag: "PREREQUISITE",
        tone,
        title: `${successorLabel} scheduled without its prerequisite`,
        body: `${reason}, so ${successorLabel} was scheduled without waiting for it.`,
        goToDate: null,
      };
    }

    case "SEQUENCE_PAST_HORIZON": {
      const predecessorLabel = plannerLabel(
        payload.predecessorId,
        "an earlier item",
      );
      const successorLabel = plannerLabel(payload.successorId, "a later item");
      const queue = payload.queueId
        ? lookups.queueById.get(payload.queueId)
        : undefined;
      const context =
        payload.source === "queue"
          ? queue
            ? ` in the "${queue.title}" queue`
            : " in a queue"
          : "";
      return {
        id: message.id,
        tag: "HORIZON",
        tone,
        title: `Forecast for ${predecessorLabel} runs past the horizon`,
        body: `The schedule couldn't reach the end of ${predecessorLabel}${context} within the planning horizon, so ${successorLabel} was scheduled without waiting for it.`,
        goToDate: null,
      };
    }

    case "SCHEDULED_OK": {
      const label = payload.placedCount === 1 ? "item" : "items";
      const title = `${payload.placedCount} ${label} successfully scheduled!`;
      const body = `All candidates placed given current templates and constraints.`;
      return {
        id: message.id,
        tag: "OK",
        tone,
        title,
        body,
        goToDate: null,
      };
    }

    default:
      // Unknown payload type — persisted row from a version we don't know
      // how to render. Return null; the caller drops it silently. Better to
      // omit than to throw on a payload shape we can't reason about.
      return null;
  }
}

/**
 * Extract a plannerId from a persisted payload if the shape carries one.
 * Used by the console to link a card to the referenced planner without the
 * caller knowing every payload variant.
 */
export function plannerIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { plannerId?: unknown };
  return typeof p.plannerId === "string" ? p.plannerId : null;
}

/**
 * Every planner id a persisted payload references, across all payload
 * variants (subject, failed queue member, dependency endpoints). Used by the
 * item Alerts page to match messages against an item's whole subtree.
 */
export function plannerSubjectIdsFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const keys = [
    "plannerId",
    "failedPlannerId",
    "predecessorId",
    "successorId",
  ] as const;
  return keys.flatMap((key) => (typeof p[key] === "string" ? [p[key]] : []));
}

function locationLabel(
  id: string | null,
  lookups: EngineMessageLookups,
): string {
  if (!id) return "Anywhere";
  return lookups.locationById.get(id)?.name ?? "Unknown";
}

// ---- Constraint attribution (TASK_TOO_LARGE / IMPOSSIBLE_CONSTRAINTS) ----
// Derived from the CURRENT entity tree, house-style: the payload carries ids
// and the emit-time limitingAxis fact; which rows contribute allowed times
// and which categories' windows apply are re-resolved here so a rename or
// re-filing never rots the prose.

function describeDayList(days: number[] | null): string | null {
  if (!days || days.length === 0 || days.length >= 7) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart = sorted[0];
  let prev = sorted[0];
  const flush = () => {
    if (runStart === prev) parts.push(WEEKDAY_LABELS[runStart]);
    else if (prev === runStart + 1)
      parts.push(`${WEEKDAY_LABELS[runStart]}, ${WEEKDAY_LABELS[prev]}`);
    else parts.push(`${WEEKDAY_LABELS[runStart]}–${WEEKDAY_LABELS[prev]}`);
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    flush();
    runStart = sorted[i];
    prev = sorted[i];
  }
  flush();
  return parts.join(", ");
}

function describeAllowedSettings(settings: AllowedTimesSettings): string {
  const days = describeDayList(settings.days);
  const ranges = settings.ranges
    ?.map((r) => `${r.startTime}–${r.endTime}`)
    .join(", ");
  if (days && ranges) return `${days} ${ranges}`;
  return days ?? ranges ?? "any time";
}

type AllowedSource = { title: string; own: boolean; text: string };

// The rows whose allowed times bind this planner: its own plus every
// ancestor's (constraints inherit down the tree). Leaf-first order.
function collectAllowedSources(
  planner: Planner,
  lookups: EngineMessageLookups,
): AllowedSource[] {
  const sources: AllowedSource[] = [];
  const seen = new Set<string>();
  let current: Planner | undefined = planner;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const parsed = parseAllowedTimes(current.allowedTimes);
    if (parsed) {
      sources.push({
        title: current.title,
        own: current.id === planner.id,
        text: describeAllowedSettings(parsed),
      });
    }
    current = current.parentId
      ? lookups.plannerById.get(current.parentId)
      : undefined;
  }
  return sources;
}

function allowedTimesPhrase(sources: AllowedSource[]): string | null {
  if (sources.length === 0) return null;
  return sources
    .map((s) =>
      s.own
        ? `its allowed times (${s.text})`
        : `the allowed times it inherits from "${s.title}" (${s.text})`,
    )
    .join(" and ");
}

// Mirrors the engine's category resolution: own parent-chain value first,
// then the queue-lent category for categoryless root members
// (applyQueueCategoryInheritance).
function effectiveCategoryFor(
  planner: Planner,
  lookups: EngineMessageLookups,
): Category | null {
  const seen = new Set<string>();
  let current: Planner | undefined = planner;
  let root: Planner = planner;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    root = current;
    if (current.categoryId) {
      return lookups.categoryById.get(current.categoryId) ?? null;
    }
    current = current.parentId
      ? lookups.plannerById.get(current.parentId)
      : undefined;
  }
  for (const queue of lookups.queueById.values()) {
    if (!queue.categoryId) continue;
    if (queue.members?.some((m) => m.plannerId === root.id)) {
      return lookups.categoryById.get(queue.categoryId) ?? null;
    }
  }
  return null;
}

// Window-bearing categories whose windows the planner may occupy — the
// engine's eligibility walk (own effective category + non-confined
// ancestors), filtered to those that actually constrain geometry.
function eligibleWindowCategoriesFor(
  planner: Planner,
  lookups: EngineMessageLookups,
): Category[] {
  const effective = effectiveCategoryFor(planner, lookups);
  if (!effective) return [];
  const categories = [...lookups.categoryById.values()];
  const eligibleIds = buildCategoryEligibilityMap(categories).get(effective.id);
  if (!eligibleIds) return [];
  return categories.filter(
    (c) => eligibleIds.has(c.id) && c.useTimeWindows && c.timeSlots.length > 0,
  );
}

function largestWindowCategoryName(eligible: Category[]): string | null {
  let best: { name: string; minutes: number } | null = null;
  for (const category of eligible) {
    for (const window of category.timeSlots) {
      const [sh, sm] = window.startTime.split(":").map(Number);
      const [eh, em] = window.endTime.split(":").map(Number);
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin += 24 * 60;
      const minutes = endMin - startMin;
      if (!best || minutes > best.minutes) {
        best = { name: category.name, minutes };
      }
    }
  }
  return best?.name ?? null;
}

function joinQuoted(names: string[]): string {
  const quoted = names.map((n) => `"${n}"`);
  if (quoted.length <= 1) return quoted[0] ?? "";
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tooLargeBody(
  payload: Extract<EngineMessagePayload, { type: "TASK_TOO_LARGE" }>,
  planner: Planner | undefined,
  lookups: EngineMessageLookups,
): string {
  const needs = `Needs ${formatMinutes(payload.duration)}.`;
  const generic = `${needs} Largest available gap is ${formatMinutes(payload.maxCapacity)} given current templates and category constraints.`;
  if (!planner || !payload.limitingAxis) return generic;

  const cap = formatMinutes(payload.maxCapacity);
  const allowed = allowedTimesPhrase(collectAllowedSources(planner, lookups));
  const windowCategories = eligibleWindowCategoriesFor(planner, lookups);
  const windowNames = joinQuoted(windowCategories.map((c) => c.name));

  switch (payload.limitingAxis) {
    case "templateGaps":
      return payload.maxCapacity === 0
        ? `Can never be scheduled: your weekly templates leave no free time at all.`
        : `${needs} The longest free stretch between your weekly templates is ${cap}.`;
    case "categoryWindow": {
      const name = largestWindowCategoryName(windowCategories);
      return name
        ? `${needs} The largest "${name}" window is ${cap}.`
        : generic;
    }
    case "allowedTimes":
      return allowed
        ? `${needs} ${capitalize(allowed)} never hold more than ${cap} in one stretch.`
        : generic;
    case "allowedTimesWindows":
      return allowed && windowNames
        ? `${needs} Where ${allowed} overlap the ${windowNames} windows, the longest stretch is ${cap}.`
        : generic;
    case "templateIntersection": {
      const inside =
        allowed && windowNames
          ? `inside ${allowed} and the ${windowNames} windows`
          : allowed
            ? `inside ${allowed}`
            : windowNames
              ? `inside the ${windowNames} windows`
              : null;
      if (!inside) return generic;
      return payload.maxCapacity === 0
        ? `Can never be scheduled: your weekly templates cover every moment ${inside}.`
        : `${needs} Around your weekly templates, the longest free stretch ${inside} is ${cap}.`;
    }
    default:
      return generic;
  }
}

function impossibleConstraintsBody(
  planner: Planner,
  lookups: EngineMessageLookups,
): string {
  const allowed = allowedTimesPhrase(collectAllowedSources(planner, lookups));
  const windowCategories = eligibleWindowCategoriesFor(planner, lookups);
  const windowNames = joinQuoted(windowCategories.map((c) => c.name));
  if (!allowed || !windowNames) {
    return unschedulableBody(SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS);
  }
  return `${capitalize(allowed)} and the ${windowNames} scheduled windows never overlap — no week has a moment where both permit it. Widen its allowed times or the ${windowNames} windows.`;
}

// Prose lives with the renderer, not the engine's SchedulingFailure — the
// scheduler emits structured facts (reason enum), the UI owns copy.
function unschedulableBody(reason: SchedulingFailureReason): string {
  switch (reason) {
    case SchedulingFailureReason.NO_SLOTS:
      return "No available time slots within the search horizon.";
    case SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS:
      return "This item's allowed times and its category's scheduled windows never overlap — no week has a moment where both permit it. Widen its allowed times or the category's windows.";
    case SchedulingFailureReason.ITERATION_LIMIT:
      return "Scheduling gave up after too many attempts.";
    case SchedulingFailureReason.DEPENDENCY_CONFLICT:
      return "Blocked by another task's placement.";
    case SchedulingFailureReason.INVALID_TASK:
      return "Task data is invalid — missing duration or required fields.";
    case SchedulingFailureReason.TEMPLATE_ERROR:
      return "Template expansion failed.";
    case SchedulingFailureReason.TOO_LARGE:
      // TOO_LARGE has its own message type; falling into this branch means
      // an emit path miscategorized. Surface generically rather than throw.
      return "Task is too large for any available gap.";
  }
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[day] ?? "?";
}
