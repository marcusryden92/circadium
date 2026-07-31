import type Anthropic from "@anthropic-ai/sdk";
import { EPHEMERAL_CACHE } from "./constants";

// Stamp cache_control on the last content block of a message, normalizing a
// string content into a single text block. The cast covers the ThinkingBlock
// variant of the union (no cache_control field) — we never emit thinking
// blocks, and every block we mark (text / tool_use / tool_result) supports it.
export function markLastBlock(
  content: Anthropic.MessageParam["content"],
): Anthropic.ContentBlockParam[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content, cache_control: EPHEMERAL_CACHE }];
  }
  if (content.length === 0) return content;
  const lastIndex = content.length - 1;
  return content.map((block, i) =>
    i === lastIndex
      ? ({
          ...block,
          cache_control: EPHEMERAL_CACHE,
        } as Anthropic.ContentBlockParam)
      : block,
  );
}

// Produce a cache-marked COPY of the pristine messages array (never mutate the
// original — markers must not accumulate across iterations). Two message-level
// write breakpoints, plus bp1 on the system block = 3 total, under the 4-marker
// cap. Cache READS happen automatically against the longest matching prefix; a
// breakpoint only controls where a cache entry is WRITTEN:
//   - historyBoundaryIndex: the last pure-history message before the
//     context-bearing final user message, so the NEXT user turn (whose history
//     extends this one byte-identically) reads the whole prior conversation
//     from cache. Skipped (< 0) when there is no prior history.
//   - the last message: extends the write frontier to the end of the current
//     transcript, so the NEXT loop iteration reads everything this one wrote.
// Caveat: cache lookback spans the last 20 content blocks, so a single
// iteration appending >20 blocks (a very large parallel tool batch) can miss
// the previous entry and re-bill that stretch — acceptable.
export function withCacheBreakpoints(
  messages: Anthropic.MessageParam[],
  historyBoundaryIndex: number,
): Anthropic.MessageParam[] {
  const markIndices = new Set<number>();
  if (historyBoundaryIndex >= 0) markIndices.add(historyBoundaryIndex);
  markIndices.add(messages.length - 1);
  return messages.map((message, i) =>
    markIndices.has(i)
      ? { ...message, content: markLastBlock(message.content) }
      : message,
  );
}
