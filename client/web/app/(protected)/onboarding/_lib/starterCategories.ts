import { v4 as uuidv4 } from "uuid";
import type { Category } from "@/types/prisma";

// Swatch hex values (light-theme). Category.color stores a raw hex string; the
// theme's category color resolution derives the dark-mode variant at render.
export type StarterRolePreset = {
  key: string;
  name: string;
  color: string;
};

// Covey-style life roles — the hats a person wears, not life domains. These are
// suggestions only (removable, renameable), so the set skews broad and
// relatable rather than assuming everyone is, say, a parent.
export const STARTER_ROLE_PRESETS: StarterRolePreset[] = [
  { key: "self", name: "Self", color: "#8b5cf6" },
  { key: "partner", name: "Partner", color: "#f43f5e" },
  { key: "parent", name: "Parent", color: "#06b6d4" },
  { key: "professional", name: "Professional", color: "#3b82f6" },
  { key: "friend", name: "Friend", color: "#22c55e" },
  { key: "family", name: "Family", color: "#14b8a6" },
  { key: "community", name: "Community", color: "#f59e0b" },
  { key: "mentor", name: "Mentor", color: "#6366f1" },
];

// Palette custom roles cycle through when the user names their own.
export const CUSTOM_ROLE_COLORS: string[] = STARTER_ROLE_PRESETS.map(
  (p) => p.color,
);

export type RoleSelection = {
  key: string;
  name: string;
  color: string;
};

// Maps existing top-level categories to Roles-step selections (returning user
// or a resumed session), in sortOrder so a re-commit's positional restamp
// reflects the real order. Must run AFTER the calendar data has hydrated —
// calling it at mount races the initial fetch and prefills nothing.
export function prefillRoleSelections(categories: Category[]): RoleSelection[] {
  return categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => {
      const preset = STARTER_ROLE_PRESETS.find(
        (p) => p.name.toLowerCase() === c.name.trim().toLowerCase(),
      );
      return preset
        ? { key: preset.key, name: preset.name, color: preset.color }
        : {
            key: `custom:${c.name.trim().toLowerCase()}`,
            name: c.name.trim(),
            color: c.color ?? CUSTOM_ROLE_COLORS[0],
          };
    });
}

// Builds a single top-level role Category. Onboarding roles start with no time
// windows (useTimeWindows false) — they carry classification and color, and the
// week/AI steps or later editing add scheduling geometry to categories nested
// under them.
export function makeRoleCategory(
  selection: RoleSelection,
  userId: string,
  nowIso: string,
  sortOrder: number,
  id: string = uuidv4(),
): Category {
  return {
    id,
    name: selection.name.trim(),
    icon: null,
    color: selection.color,
    sortOrder,
    useTimeWindows: false,
    isStrict: false,
    confineToOwnWindows: false,
    locationId: null,
    parentId: null,
    userId,
    timeSlots: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

// Builds Category rows for the picked roles.
export function buildRoleCategories(
  selections: RoleSelection[],
  userId: string,
  nowIso: string,
  sortOrderStart = 0,
): Category[] {
  return selections.map((selection, index) =>
    makeRoleCategory(selection, userId, nowIso, sortOrderStart + index),
  );
}

export interface ReconcileRolesResult {
  categories: Category[];
  ownedIds: Set<string>;
}

// Reconciles the top-level role categories to the current selection so a
// Back/forward re-commit stays idempotent: creates newly-picked roles, restamps
// sortOrder/color on the roles this flow owns (reflecting reorders), and removes
// owned roles the user deselected. Removal is childless-only — a deselected
// "Professional" that already carries a Week-step "Work" category is kept so its
// children are never orphaned.
//
// Ownership is strictly creation-based: a pre-existing category matched by name
// is never adopted, restamped, or removed — the flow must not delete or mutate
// data it didn't create, even when the user deselects that name here.
//
// `candidateIds` supplies a stable id per selection (keyed by lowercased name)
// so this stays a pure function of `prev` — the caller mints them once, outside
// any React state updater.
export function reconcileRoleCategories(
  prev: Category[],
  selections: RoleSelection[],
  ownedIds: ReadonlySet<string>,
  candidateIds: ReadonlyMap<string, string>,
  userId: string,
  nowIso: string,
): ReconcileRolesResult {
  const selectedByName = new Map(
    selections.map((s) => [s.name.trim().toLowerCase(), s] as const),
  );
  const hasChild = (id: string) => prev.some((c) => c.parentId === id);

  const removeIds = new Set<string>();
  for (const category of prev) {
    if (category.parentId || !ownedIds.has(category.id)) continue;
    const stillSelected = selectedByName.has(category.name.trim().toLowerCase());
    if (!stillSelected && !hasChild(category.id)) removeIds.add(category.id);
  }

  let next = removeIds.size
    ? prev.filter((c) => !removeIds.has(c.id))
    : [...prev];
  const nextOwned = new Set<string>();

  selections.forEach((selection, index) => {
    const key = selection.name.trim().toLowerCase();
    const idx = next.findIndex(
      (c) => !c.parentId && c.name.trim().toLowerCase() === key,
    );
    if (idx === -1) {
      const created = makeRoleCategory(
        selection,
        userId,
        nowIso,
        index,
        candidateIds.get(key),
      );
      next = [...next, created];
      nextOwned.add(created.id);
      return;
    }
    const existing = next[idx];
    if (ownedIds.has(existing.id)) {
      // Restamp order/color for a role this flow owns — this is where a
      // post-commit reorder or recolor lands.
      next = next.map((c, i) =>
        i === idx
          ? { ...c, sortOrder: index, color: selection.color, updatedAt: nowIso }
          : c,
      );
      nextOwned.add(existing.id);
    }
    // A matched pre-existing category stays unowned: selecting its name here
    // must not grant the flow the right to restamp or later delete it.
  });

  // Ownership survives deselection when the row itself survived (kept alive by
  // children): the flow created it, so a later reselect may manage it again.
  for (const id of ownedIds) {
    if (nextOwned.has(id)) continue;
    if (next.some((c) => c.id === id)) nextOwned.add(id);
  }

  return { categories: next, ownedIds: nextOwned };
}
