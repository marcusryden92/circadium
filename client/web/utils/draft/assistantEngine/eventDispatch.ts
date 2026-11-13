import { normalizeDraftTemplates } from "@/utils/draft/draftTemplates";
import { normalizeDraftWindowsState } from "@/utils/draft/draftWindows";
import { normalizeDraftPrecedenceState } from "@/utils/draft/draftPrecedence";
import { normalizeDraftHabitsState } from "@/utils/draft/draftHabits";
import type { DraftRelocation } from "@/utils/draft/draftRelocations";
import { normalizeDraftSettings } from "@/utils/draft/draftSettings";
import type { SendFn } from "./turnState";
import type { RunAssistantTurnArgs } from "./types";

type EventCallbacks = Pick<
  RunAssistantTurnArgs,
  | "onText"
  | "onForest"
  | "onTemplates"
  | "onWindows"
  | "onPrecedence"
  | "onHabits"
  | "onRelocations"
  | "onSettings"
  | "onShow"
  | "onStatus"
  | "onDone"
  | "onError"
>;

function normalizeRelocations(raw: unknown): DraftRelocation[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DraftRelocation[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { kind, itemId, targetRootId } = entry as Record<string, unknown>;
    if (typeof itemId !== "string" || itemId.length === 0) return null;
    if (kind === "promote" || kind === "triage") {
      out.push({ kind, itemId });
    } else if (kind === "demote" && typeof targetRootId === "string") {
      out.push({ kind, itemId, targetRootId });
    } else {
      return null;
    }
  }
  return out;
}

// Callback dispatch replacing the old SSE emit — same event names and payload
// shapes, including the normalize pass the SSE client ran, so the caller's
// contract is unchanged. Returns the `send` function shared by the streaming
// loop and every tool handler.
export function createSend(callbacks: EventCallbacks): SendFn {
  const {
    onText,
    onForest,
    onTemplates,
    onWindows,
    onPrecedence,
    onHabits,
    onRelocations,
    onSettings,
    onShow,
    onStatus,
    onDone,
    onError,
  } = callbacks;

  return (event, data) => {
    switch (event) {
      case "text":
        onText((data as { delta: string }).delta);
        break;
      case "forest": {
        const { callIndex, complete, fromOps } = data as {
          callIndex?: unknown;
          complete?: unknown;
          fromOps?: unknown;
        };
        onForest({
          callIndex: typeof callIndex === "number" ? callIndex : 0,
          proposal: data,
          complete: complete === true || fromOps === true,
        });
        break;
      }
      case "templates": {
        const templates = normalizeDraftTemplates(data);
        if (templates) onTemplates(templates);
        break;
      }
      case "windows": {
        const state = normalizeDraftWindowsState(data);
        if (state) onWindows(state);
        break;
      }
      case "precedence": {
        const state = normalizeDraftPrecedenceState(data);
        if (state) onPrecedence(state);
        break;
      }
      case "habits": {
        const state = normalizeDraftHabitsState(data);
        if (state) onHabits(state);
        break;
      }
      case "relocations": {
        const relocations = normalizeRelocations(data);
        if (relocations) onRelocations(relocations);
        break;
      }
      case "settings": {
        const settings = normalizeDraftSettings(data);
        if (settings) onSettings(settings);
        break;
      }
      case "status": {
        const { tool, count } = data as { tool?: unknown; count?: unknown };
        onStatus?.({
          tool: typeof tool === "string" ? tool : "",
          count: typeof count === "number" ? count : 0,
        });
        break;
      }
      case "show": {
        const { goalIds, all } = data as { goalIds?: unknown; all?: unknown };
        onShow({
          goalIds: Array.isArray(goalIds)
            ? goalIds.filter((id): id is string => typeof id === "string")
            : [],
          all: all === true,
        });
        break;
      }
      case "done": {
        const { stopReason, toolsRun } = data as {
          stopReason: string | null;
          toolsRun?: { name: string; count: number }[];
        };
        onDone({ stopReason, toolsRun: toolsRun ?? [] });
        break;
      }
      case "error":
        onError((data as { message: string }).message);
        break;
    }
  };
}
