// The in-browser BYOK assistant engine. This barrel is the module's public
// surface (@/utils/draft/assistantEngine); the tool-use loop, prompt, tool
// schemas, and helpers live in the sibling files. The browser Anthropic client
// keeps its own path (./anthropicClient) so lib/aiKey and the tests import it
// directly without pulling in the loop.
export { runAssistantTurn } from "./runAssistantTurn";
export type {
  StreamChatMessage,
  StreamDraftFocus,
  StreamDraftCategory,
  StreamDraftArgs,
  RunAssistantTurnArgs,
} from "./types";
