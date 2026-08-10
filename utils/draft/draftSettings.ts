import type { DraftOpFailure } from "./draftForestOps";

// The assistant's contract for the user's scheduling preferences — the small
// settings the Settings page edits directly. Applied at Save through the
// existing direct actions (updateUserSchedulingPreferences /
// updateWeekStartDay / updateDefaultTransportMode) + slice dispatches, never
// through the OCC diff sync.
export const TRANSPORT_MODES = [
  "DRIVING",
  "TRANSIT",
  "BICYCLING",
  "WALKING",
] as const;
export type DraftTransportMode = (typeof TRANSPORT_MODES)[number];

export interface DraftSchedulingSettings {
  // Minutes of breathing room the engine leaves after each placement.
  bufferTimeMinutes: number;
  // 0 = Sunday .. 6 = Saturday.
  weekStartDay: number;
  defaultTransportMode: DraftTransportMode;
}

export function draftSettingsEqual(
  a: DraftSchedulingSettings,
  b: DraftSchedulingSettings,
): boolean {
  return (
    a.bufferTimeMinutes === b.bufferTimeMinutes &&
    a.weekStartDay === b.weekStartDay &&
    a.defaultTransportMode === b.defaultTransportMode
  );
}

export function normalizeDraftSettings(
  raw: unknown,
): DraftSchedulingSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.bufferTimeMinutes !== "number" ||
    typeof obj.weekStartDay !== "number" ||
    !TRANSPORT_MODES.includes(obj.defaultTransportMode as DraftTransportMode)
  ) {
    return null;
  }
  return {
    bufferTimeMinutes: obj.bufferTimeMinutes,
    weekStartDay: obj.weekStartDay,
    defaultTransportMode: obj.defaultTransportMode as DraftTransportMode,
  };
}

export interface DraftSettingsUpdate {
  bufferTimeMinutes?: number;
  weekStartDay?: number;
  defaultTransportMode?: string;
}

export function updateDraftSettings(
  current: DraftSchedulingSettings,
  update: DraftSettingsUpdate,
): {
  settings: DraftSchedulingSettings;
  changed: boolean;
  failures: DraftOpFailure[];
} {
  const failures: DraftOpFailure[] = [];
  const next = { ...current };

  if (update.bufferTimeMinutes !== undefined) {
    if (
      typeof update.bufferTimeMinutes !== "number" ||
      !Number.isFinite(update.bufferTimeMinutes) ||
      update.bufferTimeMinutes < 0 ||
      update.bufferTimeMinutes > 240
    ) {
      failures.push({
        id: null,
        reason: "bufferTimeMinutes must be a number of minutes between 0 and 240",
      });
    } else {
      next.bufferTimeMinutes = Math.floor(update.bufferTimeMinutes);
    }
  }
  if (update.weekStartDay !== undefined) {
    if (
      !Number.isInteger(update.weekStartDay) ||
      update.weekStartDay < 0 ||
      update.weekStartDay > 6
    ) {
      failures.push({
        id: null,
        reason: "weekStartDay must be an integer 0-6 (0 = Sunday)",
      });
    } else {
      next.weekStartDay = update.weekStartDay;
    }
  }
  if (update.defaultTransportMode !== undefined) {
    if (
      !TRANSPORT_MODES.includes(update.defaultTransportMode as DraftTransportMode)
    ) {
      failures.push({
        id: null,
        reason:
          "defaultTransportMode must be DRIVING, TRANSIT, BICYCLING, or WALKING",
      });
    } else {
      next.defaultTransportMode =
        update.defaultTransportMode as DraftTransportMode;
    }
  }

  return {
    settings: next,
    changed: !draftSettingsEqual(next, current),
    failures,
  };
}
