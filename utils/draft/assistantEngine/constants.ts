import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AI_MODEL } from "@/lib/aiModels";

// Fallback when a turn doesn't carry an explicit model (the caller passes the
// user's chosen model; this is the floor). Lineup lives in lib/aiModels.ts.
export const MODEL: string = DEFAULT_AI_MODEL;
export const MAX_TOKENS = 16000;

// Prompt-hygiene cap: persistent conversations can outgrow what a single
// request should carry, so only the trailing window is sent.
export const MAX_HISTORY_MESSAGES = 40;

// Loop guards. Twelve turns fits the headline flow (search + fetch + template
// batches + window edits + propose_goals + follow-ups) without inviting
// runaways.
export const MAX_TOOL_TURNS = 12;
export const MAX_TREES_PER_FETCH = 25;
export const MAX_SEARCH_RESULTS = 25;
export const MAX_OP_ITEMS = 50;

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 5-minute ephemeral cache. Loop iterations are seconds apart and consecutive
// user turns usually land within the window; a 1h TTL is a possible follow-up
// (it doubles the cache-write cost).
export const EPHEMERAL_CACHE: Anthropic.CacheControlEphemeral = {
  type: "ephemeral",
};
