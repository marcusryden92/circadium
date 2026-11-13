import type { TriageType } from "@/app/(protected)/capture/_constants";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type { CommittedDump, DumpItem } from "./brainDumpRows";
import type { WeekUIState } from "./weekTemplates";

// Progress is per-user: two accounts sharing a browser must not resume each
// other's step, jots, or owned-id sets (a shared blob would commit user A's
// persisted dump items as user B's rows).
const PROGRESS_KEY_BASE = "circadium.onboarding.progress";

export function progressKey(userId: string): string {
  return `${PROGRESS_KEY_BASE}.${userId}`;
}

export type StoredCommittedDump = { id: string } & CommittedDump;

export type StoredProgress = {
  version: 4;
  stepIndex: number;
  roleCommittedIds: string[];
  weekTemplateIds: string[];
  // The Week step's form snapshot. Persisted so a resumed session re-commits
  // what the user actually configured; null means the step was never edited.
  week: WeekUIState | null;
  // Whether the last Week commit applied work windows, so a later commit with
  // work disabled knows to clear them (and never strips a Work category the
  // flow didn't touch).
  weekWorkApplied: boolean;
  dumpItems: DumpItem[];
  dumpCommitted: StoredCommittedDump[];
  // The AI step's DB conversation id, so a refresh mid-interview resumes the
  // same chat. Null until the step first reports one; cleared on an explicit
  // discard (Back with unsaved proposals).
  aiConversationId: string | null;
};

const TRIAGE_TYPES: ReadonlySet<string> = new Set<TriageType>([
  "task",
  "plan",
  "goal",
]);

function isTriageType(value: unknown): value is TriageType {
  return typeof value === "string" && TRIAGE_TYPES.has(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}

function toDumpItems(value: unknown): DumpItem[] {
  if (!Array.isArray(value)) return [];
  const items: DumpItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, title, type } = entry as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof title !== "string") continue;
    if (!isTriageType(type)) continue;
    items.push({ id, title, type });
  }
  return items;
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function toDays(value: unknown): WeekDayIntegers[] | null {
  if (!Array.isArray(value)) return null;
  const days = value.filter(
    (d): d is WeekDayIntegers =>
      typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
  );
  return days.length === value.length ? days : null;
}

// Strict shape check for the persisted Week form; any malformed field rejects
// the whole snapshot (the caller falls back to defaults) rather than half-
// restoring a form that would then re-commit garbage.
export function toWeekState(value: unknown): WeekUIState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const bools = [
    "sleepEnabled",
    "workEnabled",
    "exerciseEnabled",
    "morningEnabled",
    "eveningEnabled",
  ] as const;
  for (const key of bools) {
    if (typeof v[key] !== "boolean") return null;
  }
  const times = [
    "sleepStart",
    "sleepEnd",
    "workStart",
    "workEnd",
    "exerciseStart",
    "exerciseEnd",
    "morningStart",
    "morningEnd",
    "eveningStart",
    "eveningEnd",
  ] as const;
  for (const key of times) {
    if (!isTime(v[key])) return null;
  }
  const workDays = toDays(v.workDays);
  const exerciseDays = toDays(v.exerciseDays);
  if (!workDays || !exerciseDays) return null;
  if (v.workLocationId !== null && typeof v.workLocationId !== "string") {
    return null;
  }
  return {
    sleepEnabled: v.sleepEnabled as boolean,
    sleepStart: v.sleepStart as string,
    sleepEnd: v.sleepEnd as string,
    workEnabled: v.workEnabled as boolean,
    workStart: v.workStart as string,
    workEnd: v.workEnd as string,
    workDays,
    workLocationId: v.workLocationId,
    exerciseEnabled: v.exerciseEnabled as boolean,
    exerciseStart: v.exerciseStart as string,
    exerciseEnd: v.exerciseEnd as string,
    exerciseDays,
    morningEnabled: v.morningEnabled as boolean,
    morningStart: v.morningStart as string,
    morningEnd: v.morningEnd as string,
    eveningEnabled: v.eveningEnabled as boolean,
    eveningStart: v.eveningStart as string,
    eveningEnd: v.eveningEnd as string,
  };
}

// Normalizes any persisted payload to the current schema.
//
// A versionless (v1) payload predates the brain-dump step: its step order was
// Welcome(0) Areas(1) Places(2) Week(3) AI(4), so its AI step (index >= 4) maps
// to the new AI step at index 5, and the brain-dump / area-tracking fields
// default empty.
//
// A v2 payload predates role-commit reconciliation and per-dump snapshots: it
// carried `dumpCommittedIds: string[]` instead of `dumpCommitted`. We rebuild
// snapshots from its own `dumpItems` (last-committed assumed equal to the
// persisted jots — the safe default, which treats nothing as user-edited on the
// next commit) and default `roleCommittedIds` empty.
//
// A v3 payload predates the Week form snapshot: `week` defaults null (the Week
// step falls back to defaults) and `weekWorkApplied` false (a pre-migration
// work commit won't be auto-cleared on an off-toggle — the conservative
// choice).
export function migrateProgress(raw: unknown): StoredProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === "number" ? obj.version : 1;
  const weekTemplateIds = toStringArray(obj.weekTemplateIds);
  let stepIndex = typeof obj.stepIndex === "number" ? obj.stepIndex : 0;

  if (version < 2) {
    if (stepIndex >= 4) stepIndex = 5;
    return {
      version: 4,
      stepIndex,
      roleCommittedIds: [],
      weekTemplateIds,
      week: null,
      weekWorkApplied: false,
      dumpItems: [],
      dumpCommitted: [],
      aiConversationId: null,
    };
  }

  const dumpItems = toDumpItems(obj.dumpItems);
  // `areaCommittedIds` is the pre-rename key from the first v3 blobs; read it as
  // a fallback so an in-flight session's owned roles survive the rename.
  const roleCommittedIds = toStringArray(
    obj.roleCommittedIds ?? obj.areaCommittedIds,
  );

  let dumpCommitted: StoredCommittedDump[];
  if (Array.isArray(obj.dumpCommitted)) {
    dumpCommitted = [];
    for (const entry of obj.dumpCommitted) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, title, type } = entry as Record<string, unknown>;
      if (typeof id !== "string" || id.length === 0) continue;
      if (typeof title !== "string" || !isTriageType(type)) continue;
      dumpCommitted.push({ id, title, type });
    }
  } else {
    // v2 → v3: rebuild snapshots from the committed ids using the persisted jots.
    const committedIds = new Set(toStringArray(obj.dumpCommittedIds));
    dumpCommitted = dumpItems
      .filter((it) => committedIds.has(it.id))
      .map((it) => ({ id: it.id, title: it.title.trim(), type: it.type }));
  }

  return {
    version: 4,
    stepIndex,
    roleCommittedIds,
    weekTemplateIds,
    week: toWeekState(obj.week),
    weekWorkApplied: obj.weekWorkApplied === true,
    dumpItems,
    dumpCommitted,
    aiConversationId:
      typeof obj.aiConversationId === "string" && obj.aiConversationId
        ? obj.aiConversationId
        : null,
  };
}

// Reads the user's progress, adopting a legacy unscoped blob once: the shared
// key predates per-user scoping, and the first account to load after the
// upgrade claims it (single-user browsers, the overwhelmingly common case) so
// an in-flight session survives; the legacy key is then removed so a second
// account can't inherit it.
export function loadProgress(userId: string): StoredProgress | null {
  try {
    const scoped = localStorage.getItem(progressKey(userId));
    if (scoped) return migrateProgress(JSON.parse(scoped));
    const legacy = localStorage.getItem(PROGRESS_KEY_BASE);
    if (!legacy) return null;
    const migrated = migrateProgress(JSON.parse(legacy));
    localStorage.removeItem(PROGRESS_KEY_BASE);
    if (migrated) {
      localStorage.setItem(progressKey(userId), JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return null;
  }
}

export function saveProgress(userId: string, progress: StoredProgress): void {
  try {
    localStorage.setItem(progressKey(userId), JSON.stringify(progress));
  } catch {
    // Progress persistence is best-effort.
  }
}

export function clearProgress(userId: string): void {
  try {
    localStorage.removeItem(progressKey(userId));
    localStorage.removeItem(PROGRESS_KEY_BASE);
  } catch {
    // best-effort
  }
}
