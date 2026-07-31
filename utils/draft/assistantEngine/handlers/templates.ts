import type Anthropic from "@anthropic-ai/sdk";
import {
  addDraftTemplates,
  deleteDraftTemplates,
  updateDraftTemplates,
  type DraftTemplateOpsResult,
  type DraftTemplateUpdate,
} from "@/utils/draft/draftTemplateOps";
import { MAX_OP_ITEMS } from "../constants";
import { parseStringArray } from "../helpers";
import type { TurnState } from "../turnState";

// Template sibling of applyOpResult. The event carries the full authoritative
// array — small list, last write wins, no caller folding.
function applyTemplateOpResult(
  state: TurnState,
  result: DraftTemplateOpsResult,
  appliedVerb: string,
): string {
  state.workingTemplates = result.templates;
  if (result.changed) {
    state.send("templates", { templates: state.workingTemplates });
  }
  const parts: string[] = [];
  if (result.changed) {
    parts.push(
      `${appliedVerb} — the user sees it as a pending change on the Week tab.`,
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

export function handleAddTemplates(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.templates) ? input.templates : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  const before = new Set(state.workingTemplates.map((t) => t.id));
  const result = addDraftTemplates(
    state.workingTemplates,
    items,
    state.validLocationIds,
  );
  const minted = result.templates.filter((t) => !before.has(t.id));
  const mintedNote =
    minted.length > 0
      ? ` Assigned ids: ${minted
          .map((t) => `"${t.title}" = ${t.id}`)
          .join(", ")}.`
      : "";
  return (
    applyTemplateOpResult(state, result, `Added ${minted.length} template(s)`) +
    mintedNote
  );
}

export function handleUpdateTemplates(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftTemplateUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  return applyTemplateOpResult(
    state,
    updateDraftTemplates(
      state.workingTemplates,
      updates,
      state.validLocationIds,
    ),
    `Updated ${updates.length} template(s)`,
  );
}

export function handleDeleteTemplates(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const templateIds = parseStringArray(input?.templateIds).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: templateIds.length });
  return applyTemplateOpResult(
    state,
    deleteDraftTemplates(state.workingTemplates, templateIds),
    `Deleted ${templateIds.length} template(s)`,
  );
}
