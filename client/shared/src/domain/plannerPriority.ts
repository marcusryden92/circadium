// Priority is a 1-7 relative scale (higher = more urgent). The engine consumes
// it as a linear multiplier in the urgency score (sortByPriorityAndConstraints),
// so these bounds are a UI + consistency contract rather than a hard engine
// requirement — but every create surface and the AI ops normalize into the
// range so no row can sit off the picker. 4 is the neutral middle a new item
// starts at. This is the single source every priority surface imports.
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 7;
export const PRIORITY_DEFAULT = 4;

// Ascending [1..7] for the priority pickers.
export const PRIORITY_LEVELS: readonly number[] = Array.from(
  { length: PRIORITY_MAX - PRIORITY_MIN + 1 },
  (_, i) => PRIORITY_MIN + i,
);

// Floor (priority is conceptually an integer) then clamp into [MIN, MAX]; a
// non-finite value falls back to the neutral default.
export function clampPriority(value: number): number {
  if (!Number.isFinite(value)) return PRIORITY_DEFAULT;
  return Math.min(PRIORITY_MAX, Math.max(PRIORITY_MIN, Math.floor(value)));
}
