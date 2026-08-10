"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { parse as parsePartial, Allow } from "partial-json";
import { pruneDraftPrecedence } from "@/utils/draft/draftPrecedence";
import { pruneDraftHabits } from "@/utils/draft/draftHabits";
import {
  type DraftTimeWindow,
  type DraftWindowsState,
} from "@/utils/draft/draftWindows";
import { createBrowserAnthropicClient } from "./anthropicClient";
import {
  MAX_HISTORY_MESSAGES,
  MAX_TOKENS,
  MAX_TOOL_TURNS,
  MODEL,
} from "./constants";
import { getSystemBlocks } from "./systemPrompt";
import { buildDynamicContext } from "./promptContext";
import { withCacheBreakpoints } from "./caching";
import { describeAssistantError, parseGoalIds } from "./helpers";
import { ASSISTANT_TOOLS } from "./tools";
import { createSend } from "./eventDispatch";
import { filterProposal, type TurnState } from "./turnState";
import { executeTool } from "./handlers";
import type { RunAssistantTurnArgs } from "./types";

// The assistant's tool-use loop, running IN THE BROWSER on the user's own
// Anthropic API key (BYOK — the key comes from the device vault in lib/aiKey
// and never touches our server). This used to be app/api/draft/stream: the
// client already held the full working state and uploaded it per request, so
// the loop moved here wholesale — same prompt, same tools, same deterministic
// ops, with the SSE events replaced by direct callbacks.
//
// Architecture: the model does NOT receive the full forest. The system prompt
// carries a one-line-per-goal index; the model pulls complete trees on demand
// via the get_goal_trees tool, answered from the working copy (all local —
// the index + fetched trees are all that ever reaches Anthropic). This runs
// as a tool-use loop: stream -> execute tool calls -> feed tool_results back
// -> stream again, until the model ends its turn.
//
// This file owns the setup + the streaming loop; the per-tool work lives in
// ./handlers (grouped by domain), sharing the mutable ./turnState. The baseURL
// parameter is the future managed-mode seam: a thin authenticated proxy route
// that injects the app's key server-side runs this same loop unchanged.

export async function runAssistantTurn({
  currentForest,
  currentTemplates,
  currentPrecedence,
  currentHabits,
  recurringPlanIds,
  history,
  focus,
  categories,
  locations,
  currentInbox,
  currentRelocations,
  currentSettings,
  templateExceptionIds,
  windowExceptionIds,
  today,
  intent,
  apiKey,
  baseURL,
  signal,
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
}: RunAssistantTurnArgs): Promise<void> {
  const client = createBrowserAnthropicClient(apiKey, baseURL);

  const send = createSend({
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
  });

  // Forest edits inside the turn prune precedence + habits (a deleted goal
  // must not linger as a queue member or a tracked item). The initial prune
  // heals a caller that missed a prune event on an aborted stream; its
  // `changed` flag decides whether to emit before the loop starts.
  const initialPrune = pruneDraftPrecedence(currentPrecedence, currentForest);
  const initialHabitPrune = pruneDraftHabits(currentHabits, currentForest);

  // The categories domain travels as records + their windows, built from the
  // caller's categories; ops emit the whole next state.
  const workingWindows: DraftWindowsState = {
    windows: categories.flatMap((c) =>
      c.timeSlots.map(
        (w): DraftTimeWindow => ({
          id: w.id,
          categoryId: c.id,
          day: w.day,
          startTime: w.startTime,
          endTime: w.endTime,
        }),
      ),
    ),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      parentId: c.parentId,
      locationId: c.locationId,
      useTimeWindows: c.useTimeWindows,
      isStrict: c.isStrict,
      confineToOwnWindows: c.confineToOwnWindows,
    })),
  };

  // The focused goal is pre-fetched in the prompt; everything else must go
  // through get_goal_trees before a complete-tree proposal may touch it.
  const fetchedGoalIds = new Set<string>();
  if (focus?.rootId) fetchedGoalIds.add(focus.rootId);

  const state: TurnState = {
    workingForest: currentForest,
    workingTemplates: currentTemplates,
    workingWindows,
    workingPrecedence: initialPrune.state,
    workingHabits: initialHabitPrune.state,
    proposeCallCounter: 0,
    proposeCallIndexByToolUseId: new Map(),
    existingGoalIds: new Set(
      currentForest.goals.map((g) => g.id).filter((id) => id.length > 0),
    ),
    fetchedGoalIds,
    workingRelocations: [...currentRelocations],
    // Anything already triaged into the working forest is no longer inbox.
    workingInbox: currentInbox.filter(
      (entry) => !currentForest.goals.some((g) => g.id === entry.id),
    ),
    workingSettings: currentSettings,
    recurringPlanIdSet: new Set(recurringPlanIds),
    validLocationIds: new Set(locations.map((l) => l.id)),
    templateExceptionIds: new Set(templateExceptionIds),
    windowExceptionIds: new Set(windowExceptionIds),
    send,
  };

  if (initialPrune.changed) send("precedence", state.workingPrecedence);
  if (initialHabitPrune.changed) send("habits", state.workingHabits);

  // The system is the byte-stable cached prefix (tools + static instructions);
  // all turn-varying data rides trailing the final user message instead.
  const systemBlocks = getSystemBlocks(intent);
  const dynamicContext = buildDynamicContext({
    currentForest,
    currentTemplates,
    currentPrecedence: state.workingPrecedence,
    currentHabits: state.workingHabits,
    focus,
    categories,
    locations,
    inbox: state.workingInbox,
    settings: state.workingSettings,
    templateExceptionIds: state.templateExceptionIds,
    windowExceptionIds: state.windowExceptionIds,
    today,
  });

  try {
    const messages: Anthropic.MessageParam[] = history
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Deliver the live state trailing the final user message rather than in the
    // system prompt: history is prose-only (rebuilt each send), so the shared
    // prefix (tools + static system + prior history) stays byte-stable and
    // cacheable across user turns. The dynamic block leads with a supersedence
    // note so an earlier turn's context (gone from history) can't mislead.
    const contextBlock: Anthropic.TextBlockParam = {
      type: "text",
      text: `<current_state>\nThis is the user's live planning data as of this message; it supersedes any state described earlier in the conversation.\n\n${dynamicContext}\n</current_state>`,
    };
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      const userText = typeof last.content === "string" ? last.content : "";
      messages[messages.length - 1] = {
        role: last.role,
        content: userText
          ? [contextBlock, { type: "text", text: userText }]
          : [contextBlock],
      };
    } else {
      messages.push({ role: "user", content: [contextBlock] });
    }
    // The pure-history boundary: the message before the context-bearing final
    // user message. Fixed for the turn (messages only grows via push), and < 0
    // when there is no prior history (nothing to cache across turns yet).
    const historyBoundaryIndex = messages.length - 2;

    // Per-send usage totals, logged in dev to verify caching engages
    // (cache_read_input_tokens should be > 0 from iteration 2 onward).
    const usageTotals = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    let stopReason: string | null = null;

    // Prose segments before and after a tool call are separate content
    // blocks; the caller concatenates all text into one bubble, so without an
    // injected break they fuse mid-sentence
    // ("...your goals!Your planning library...").
    let anyTextSent = false;
    let needsSeparator = false;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      // Fresh per stream iteration: the final stamped propose_goals re-emit
      // reuses the callIndex its id-less partials streamed under.
      state.proposeCallIndexByToolUseId = new Map();

      // The abort signal fires when the user hits Stop or closes the modal.
      // Forwarding it aborts the upstream Anthropic request so the user stops
      // paying for tokens nobody will receive.
      const anthropicStream = client.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // Output tokens are the priciest; medium effort consolidates tool
          // calls and terses replies. One-line revert if quality drops.
          output_config: { effort: "medium" },
          system: systemBlocks,
          messages: withCacheBreakpoints(messages, historyBoundaryIndex),
          tools: ASSISTANT_TOOLS,
        },
        { signal },
      );

      let toolInputAccumulator = "";
      let currentToolName: string | null = null;
      let currentProposeCallIndex = 0;
      let lastEmittedProposalJson: string | null = null;

      for await (const event of anthropicStream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            toolInputAccumulator = "";
            currentToolName = event.content_block.name;
            if (currentToolName === "propose_goals") {
              currentProposeCallIndex = state.proposeCallCounter++;
              state.proposeCallIndexByToolUseId.set(
                event.content_block.id,
                currentProposeCallIndex,
              );
            }
            if (anyTextSent) needsSeparator = true;
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            if (needsSeparator) {
              needsSeparator = false;
              send("text", { delta: "\n\n" });
            }
            anyTextSent = true;
            send("text", { delta: event.delta.text });
          } else if (event.delta.type === "input_json_delta") {
            toolInputAccumulator += event.delta.partial_json;
            if (currentToolName !== "propose_goals") continue;
            // Best-effort partial parse. `Allow.ALL` lets partial-json fill
            // in missing brackets/quotes so we can extract whatever complete
            // goals have landed so far.
            try {
              const partial: unknown = parsePartial(
                toolInputAccumulator,
                Allow.ALL,
              );
              if (
                partial &&
                typeof partial === "object" &&
                "goals" in partial
              ) {
                const filtered = filterProposal(state, partial);
                const proposal = {
                  callIndex: currentProposeCallIndex,
                  goals: filtered.goals,
                  deletedGoalIds: filtered.deletedGoalIds,
                };
                const proposalJson = JSON.stringify(proposal);
                if (proposalJson !== lastEmittedProposalJson) {
                  lastEmittedProposalJson = proposalJson;
                  send("forest", proposal);
                }
              }
            } catch {
              // Not yet parseable — wait for more deltas.
            }
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolName === "show_goals") {
            try {
              const input: unknown = JSON.parse(toolInputAccumulator || "{}");
              const { all } = (input ?? {}) as { all?: unknown };
              send("show", {
                goalIds: parseGoalIds(input),
                all: all === true,
              });
            } catch {
              // Malformed tool input — nothing to show.
            }
          }
          currentToolName = null;
        }
      }

      const finalMessage = await anthropicStream.finalMessage();
      stopReason = finalMessage.stop_reason;

      const usage = finalMessage.usage;
      usageTotals.input_tokens += usage.input_tokens ?? 0;
      usageTotals.output_tokens += usage.output_tokens ?? 0;
      usageTotals.cache_creation_input_tokens +=
        usage.cache_creation_input_tokens ?? 0;
      usageTotals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[assistant] iter ${turn}: in=${usage.input_tokens ?? 0} out=${
            usage.output_tokens ?? 0
          } cacheWrite=${usage.cache_creation_input_tokens ?? 0} cacheRead=${
            usage.cache_read_input_tokens ?? 0
          }`,
        );
      }

      if (finalMessage.stop_reason !== "tool_use") break;

      const toolUses = finalMessage.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (toolUses.length === 0) break;

      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: executeTool(state, tu),
      }));

      messages.push({ role: "assistant", content: finalMessage.content });
      messages.push({ role: "user", content: results });
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[assistant] send totals: in=${usageTotals.input_tokens} out=${usageTotals.output_tokens} cacheWrite=${usageTotals.cache_creation_input_tokens} cacheRead=${usageTotals.cache_read_input_tokens}`,
      );
    }

    send("done", { stopReason });
  } catch (err) {
    // User-initiated abort is a normal exit, not an error to report.
    if (!signal?.aborted) {
      send("error", { message: describeAssistantError(err) });
    }
  }
}
