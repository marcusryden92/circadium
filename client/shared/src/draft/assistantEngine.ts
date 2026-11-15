// The BYOK assistant engine. This barrel is the module's public surface
// (@circadium/shared/draft/assistantEngine); the tool-use loop, prompt, tool
// schemas, and helpers live under ./assistantEngine/. The Anthropic client
// itself is host-injected via the RunAssistantTurnArgs.createClient factory
// (web supplies the browser BYOK client), so the loop never imports a
// transport.
export { runAssistantTurn } from "./assistantEngine/runAssistantTurn";
export {
  DEFAULT_AI_MODEL,
  resolveAiModel,
  AI_MODELS,
} from "./assistantEngine/aiModels";
export type { AiModelId, AiModelOption } from "./assistantEngine/aiModels";
export type {
  StreamChatMessage,
  StreamDraftFocus,
  StreamDraftCategory,
  StreamDraftArgs,
  RunAssistantTurnArgs,
  AnthropicClientFactory,
} from "./assistantEngine/types";
