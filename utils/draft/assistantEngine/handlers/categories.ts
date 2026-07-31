import type Anthropic from "@anthropic-ai/sdk";
import {
  findWindowOverlaps,
  type DraftTimeWindow,
  type DraftWindowsState,
} from "@/utils/draft/draftWindows";
import {
  addDraftCategories,
  addDraftTimeWindows,
  deleteDraftCategories,
  deleteDraftTimeWindows,
  updateDraftCategories,
  updateDraftTimeWindows,
  type DraftCategoryUpdate,
  type DraftTimeWindowUpdate,
  type DraftWindowOpsResult,
} from "@/utils/draft/draftWindowOps";
import { DAY_NAMES, MAX_OP_ITEMS } from "../constants";
import { parseStringArray } from "../helpers";
import {
  categoryName,
  currentCategoryIds,
  type TurnState,
} from "../turnState";

// Categories sibling of applyTemplateOpResult — same full-state contract.
function applyWindowOpResult(
  state: TurnState,
  result: DraftWindowOpsResult,
  appliedVerb: string,
): string {
  state.workingWindows = result.state;
  if (result.changed) {
    state.send("windows", {
      windows: state.workingWindows.windows,
      categories: state.workingWindows.categories,
    });
  }
  const parts: string[] = [];
  if (result.changed) {
    parts.push(
      `${appliedVerb} — the user sees it as a pending change on the Categories tab.`,
    );
  }
  if (result.autoEnabledCategoryIds.length > 0) {
    parts.push(
      `Auto-enabled windows for: ${result.autoEnabledCategoryIds
        .map((id) => categoryName(state, id))
        .join(", ")} — tell the user.`,
    );
  }
  if (result.failures.length > 0) {
    parts.push(
      `Failed: ${result.failures
        .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
        .join("; ")}.`,
    );
  }
  return parts.join(" ") || "Nothing changed.";
}

// Overlapping windows are accepted by the ops (a batch may be fixed by a later
// call) but flagged straight back to the model, which the prompt instructs to
// resolve before ending its turn. Only pairs involving windows this op touched
// are reported, so pre-existing overlaps in the user's data don't nag on every
// op.
const MAX_REPORTED_OVERLAPS = 5;

function describeWindow(state: TurnState, w: DraftTimeWindow): string {
  return `"${categoryName(state, w.categoryId)}" ${
    DAY_NAMES[w.day]
  } ${w.startTime}-${w.endTime} (${w.id})`;
}

function buildOverlapNote(
  state: TurnState,
  windowsState: DraftWindowsState,
  touchedIds: ReadonlySet<string>,
): string {
  const overlaps = findWindowOverlaps(windowsState.windows, touchedIds);
  if (overlaps.length === 0) return "";
  const listed = overlaps
    .slice(0, MAX_REPORTED_OVERLAPS)
    .map(
      ({ a, b }) =>
        `${describeWindow(state, a)} overlaps ${describeWindow(state, b)}`,
    )
    .join("; ");
  const more =
    overlaps.length > MAX_REPORTED_OVERLAPS
      ? ` (+${overlaps.length - MAX_REPORTED_OVERLAPS} more)`
      : "";
  return ` OVERLAP WARNING: ${listed}${more}. Category windows must never overlap — adjust or delete the conflicting windows now.`;
}

export function handleAddTimeWindows(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.windows) ? input.windows : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  const before = new Set(state.workingWindows.windows.map((w) => w.id));
  const result = addDraftTimeWindows(state.workingWindows, items);
  const minted = result.state.windows.filter((w) => !before.has(w.id));
  const mintedNote =
    minted.length > 0
      ? ` Assigned ids: ${minted
          .map(
            (w) =>
              `"${categoryName(state, w.categoryId)} ${
                DAY_NAMES[w.day]
              }" = ${w.id}`,
          )
          .join(", ")}.`
      : "";
  return (
    applyWindowOpResult(state, result, `Added ${minted.length} window(s)`) +
    mintedNote +
    buildOverlapNote(state, result.state, new Set(minted.map((w) => w.id)))
  );
}

export function handleUpdateTimeWindows(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftTimeWindowUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  const result = updateDraftTimeWindows(state.workingWindows, updates);
  return (
    applyWindowOpResult(state, result, `Updated ${updates.length} window(s)`) +
    buildOverlapNote(
      state,
      result.state,
      new Set(
        updates
          .map((u) => u.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    )
  );
}

export function handleDeleteTimeWindows(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const windowIds = parseStringArray(input?.windowIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: windowIds.length });
  return applyWindowOpResult(
    state,
    deleteDraftTimeWindows(state.workingWindows, windowIds),
    `Deleted ${windowIds.length} window(s)`,
  );
}

export function handleAddCategories(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.categories) ? input.categories : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  const before = currentCategoryIds(state);
  const result = addDraftCategories(
    state.workingWindows,
    items,
    state.validLocationIds,
  );
  const minted = result.state.categories.filter((c) => !before.has(c.id));
  const mintedNote =
    minted.length > 0
      ? ` Assigned ids: ${minted
          .map((c) => `"${c.name}" = ${c.id}`)
          .join(
            ", ",
          )}. Use these ids for windows, sub-categories, and filing items.`
      : "";
  return (
    applyWindowOpResult(
      state,
      result,
      `Created ${minted.length} categor${minted.length === 1 ? "y" : "ies"}`,
    ) + mintedNote
  );
}

export function handleUpdateCategories(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftCategoryUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  return applyWindowOpResult(
    state,
    updateDraftCategories(state.workingWindows, updates, state.validLocationIds),
    `Updated ${updates.length} categor${updates.length === 1 ? "y" : "ies"}`,
  );
}

export function handleDeleteCategories(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const categoryIds = parseStringArray(input?.categoryIds).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: categoryIds.length });
  const before = state.workingWindows.categories;
  const result = deleteDraftCategories(state.workingWindows, categoryIds);
  const afterIds = new Set(result.state.categories.map((c) => c.id));
  const removed = before.filter((c) => !afterIds.has(c.id));
  const removedNote =
    removed.length > 0
      ? ` Removed (with sub-categories and windows): ${removed
          .map((c) => `"${c.name}"`)
          .join(
            ", ",
          )}. Items filed under them are kept and become uncategorized.`
      : "";
  return (
    applyWindowOpResult(
      state,
      result,
      `Deleted ${removed.length} categor${removed.length === 1 ? "y" : "ies"}`,
    ) + removedNote
  );
}
