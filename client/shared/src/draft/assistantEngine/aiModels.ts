// The assistant model lineup, shared by the engine, the BYOK access context,
// Settings, and the in-chat picker. Stored on User.aiModel as a plain string
// (null = DEFAULT_AI_MODEL) so adding or retiring a model is a one-line edit
// here with no migration. Every model listed must accept the engine's
// `output_config: { effort }` param (Opus 4.8 and Sonnet 5 do; Haiku does not
// — don't add it here without teaching runAssistantTurn to drop effort).

export type AiModelId = "claude-opus-4-8" | "claude-sonnet-5";

export interface AiModelOption {
  id: AiModelId;
  label: string;
  blurb: string;
}

export const AI_MODELS: readonly AiModelOption[] = [
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8",
    blurb: "Most capable. Best for complex restructuring — higher token cost.",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "Faster and cheaper, near-Opus on most planning tasks.",
  },
];

export const DEFAULT_AI_MODEL: AiModelId = "claude-opus-4-8";

// Any persisted/user-supplied id that isn't in the current lineup falls back to
// the default, so a retired model id can never reach the Anthropic API.
export function resolveAiModel(id: string | null | undefined): AiModelId {
  return AI_MODELS.some((m) => m.id === id)
    ? (id as AiModelId)
    : DEFAULT_AI_MODEL;
}
