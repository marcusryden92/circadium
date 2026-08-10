import type Anthropic from "@anthropic-ai/sdk";
import {
  demoteDraftItem,
  promoteDraftItem,
  triageDraftInboxItems,
  type DraftRelocationOpResult,
} from "@/utils/draft/draftForestOps";
import { updateDraftSettings } from "@/utils/draft/draftSettings";
import { MAX_OP_ITEMS } from "../constants";
import { parseStringArray } from "../helpers";
import type { TurnState } from "../turnState";
import { applyOpResult } from "./items";

// Promote/demote/triage: forest surgery that crosses the root boundary. The
// op mirrors the app's native helper on the working forest; the relocation
// record it hands back is what makes the id survive with its identity at Save
// (replayDraftRelocations runs the real helpers on the canonical array before
// the regular apply).
function applyRelocationResult(
  state: TurnState,
  result: DraftRelocationOpResult,
  appliedVerb: string,
): string {
  if (result.relocation) {
    state.workingRelocations = [...state.workingRelocations, result.relocation];
    state.send("relocations", state.workingRelocations);
  }
  return applyOpResult(state, result, appliedVerb);
}

export function handlePromoteItem(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const itemId = typeof input?.itemId === "string" ? input.itemId : "";
  state.send("status", { tool: tu.name, count: 1 });
  const result = promoteDraftItem(state.workingForest, itemId);
  if (result.relocation) {
    // The item now stands at the top level under its canonical id. It counts
    // as an existing goal for the fetch-before-modify guard, and the model
    // has NOT necessarily seen its full subtree — require a fetch before any
    // wholesale re-propose.
    state.existingGoalIds.add(itemId);
  }
  return applyRelocationResult(
    state,
    result,
    "Promoted the item to the top level (it keeps its identity and connections)",
  );
}

export function handleDemoteItem(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  state.send("status", { tool: tu.name, count: 1 });
  const result = demoteDraftItem(
    state.workingForest,
    {
      itemId: typeof input?.itemId === "string" ? input.itemId : "",
      targetRootId:
        typeof input?.targetGoalId === "string" ? input.targetGoalId : "",
    },
    state.workingPrecedence,
  );
  return applyRelocationResult(
    state,
    result,
    "Nested the item as the target goal's last step (queue membership drops; prerequisite links survive)",
  );
}

export function handleTriageItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const itemIds = parseStringArray(input?.itemIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: itemIds.length });

  const entries = [];
  const failures: string[] = [];
  for (const id of itemIds) {
    const entry = state.workingInbox.find((e) => e.id === id);
    if (entry) entries.push(entry);
    else failures.push(`${id}: not in the capture inbox`);
  }

  const result = triageDraftInboxItems(state.workingForest, entries);
  const triagedIds = new Set(result.relocations.map((r) => r.itemId));
  state.workingInbox = state.workingInbox.filter((e) => !triagedIds.has(e.id));
  if (result.relocations.length > 0) {
    state.workingRelocations = [
      ...state.workingRelocations,
      ...result.relocations,
    ];
    state.send("relocations", state.workingRelocations);
    for (const id of triagedIds) {
      // The triaged jot is a plain childless task the model has now seen
      // whole — freely editable and re-proposable.
      state.existingGoalIds.add(id);
      state.fetchedGoalIds.add(id);
    }
  }
  const base = applyOpResult(
    state,
    result,
    `Triaged ${result.relocations.length} item(s) into the library as tasks (30min placeholder duration — set real durations, categories, and deadlines next)`,
  );
  return failures.length > 0 ? `${base} Failed: ${failures.join("; ")}.` : base;
}

export function handleUpdateSchedulingSettings(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = (tu.input ?? {}) as Record<string, unknown>;
  state.send("status", { tool: tu.name, count: 1 });
  const result = updateDraftSettings(state.workingSettings, {
    bufferTimeMinutes:
      typeof input.bufferTimeMinutes === "number"
        ? input.bufferTimeMinutes
        : undefined,
    weekStartDay:
      typeof input.weekStartDay === "number" ? input.weekStartDay : undefined,
    defaultTransportMode:
      typeof input.defaultTransportMode === "string"
        ? input.defaultTransportMode
        : undefined,
  });
  if (result.changed) {
    state.workingSettings = result.settings;
    state.send("settings", state.workingSettings);
  }
  const parts: string[] = [];
  if (result.changed) {
    parts.push(
      "Updated the scheduling settings — the user sees it as a pending change (applied when they save).",
    );
  }
  if (result.failures.length > 0) {
    parts.push(`Failed: ${result.failures.map((f) => f.reason).join("; ")}.`);
  }
  return parts.join(" ") || "Nothing changed.";
}
