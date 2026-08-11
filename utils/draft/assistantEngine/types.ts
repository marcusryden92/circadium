import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import type { DraftTemplate } from "@/utils/draft/draftTemplates";
import type { DraftWindowsState } from "@/utils/draft/draftWindows";
import type { DraftPrecedenceState } from "@/utils/draft/draftPrecedence";
import type { DraftHabitsState } from "@/utils/draft/draftHabits";
import type { DraftRelocation } from "@/utils/draft/draftRelocations";
import type { DraftSchedulingSettings } from "@/utils/draft/draftSettings";

// A capture-inbox jot the assistant may triage into the library.
export interface DraftInboxItem {
  id: string;
  title: string;
  notes: string | null;
}

export interface StreamChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamDraftFocus {
  rootId: string | null;
  itemId: string | null;
}

export interface StreamDraftCategory {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  locationId: string | null;
  isStrict: boolean;
  useTimeWindows: boolean;
  confineToOwnWindows: boolean;
  timeSlots: { id: string; day: number; startTime: string; endTime: string }[];
}

export interface DraftLocationRef {
  id: string;
  name: string;
}

export interface StreamDraftArgs {
  currentForest: DraftForest;
  currentTemplates: DraftTemplate[];
  currentPrecedence: DraftPrecedenceState;
  currentHabits: DraftHabitsState;
  // Canonical plan roots whose recurrence parses — habit items must repeat,
  // and plan recurrence lives outside the forest contract, so eligibility for
  // plans is checked against this set (static per turn: the assistant can't
  // edit plan recurrence).
  recurringPlanIds: string[];
  history: StreamChatMessage[];
  focus: StreamDraftFocus | null;
  categories: StreamDraftCategory[];
  locations: DraftLocationRef[];
  // Untriaged capture-inbox jots (excluding anything already triaged in the
  // working state) — the triage_items tool pulls them into the forest.
  currentInbox: DraftInboxItem[];
  // Sanctioned cross-boundary moves recorded by earlier turns this session
  // (promote/demote/triage); the engine appends and re-emits the full list.
  currentRelocations: DraftRelocation[];
  // The user's scheduling preferences; update_scheduling_settings patches the
  // working copy, applied at Save through the direct settings actions.
  currentSettings: DraftSchedulingSettings;
  // Category-window ids carrying per-occurrence exceptions (hand-moved or
  // skipped occurrences). Re-timing one of these drops its exceptions at
  // Save, so ops warn in the tool result. Templates need no equivalent set:
  // their exceptions ride the DraftTemplate contract itself.
  windowExceptionIds: string[];
  today: string;
  // Programmatic session hint (e.g. "onboarding") — keys a prompt preamble.
  // Prompt-only; never alters tool/apply semantics.
  intent?: string | null;
  signal?: AbortSignal;
  onText: (delta: string) => void;
  // Raw (possibly partial) propose_goals input plus its callIndex; the caller
  // normalizes and folds it against the turn-start working forest. `complete`
  // marks finalized emits (stamped propose_goals re-emit or fromOps trees) —
  // anything else may be a truncated partial if the stream aborts.
  onForest: (payload: {
    callIndex: number;
    proposal: unknown;
    complete: boolean;
  }) => void;
  // Template ops emit the full authoritative array — the caller replaces its
  // working templates wholesale (last write wins, no folding).
  onTemplates: (templates: DraftTemplate[]) => void;
  // Window/flag ops emit the full authoritative state — same contract.
  onWindows: (state: DraftWindowsState) => void;
  // Queue/dependency ops emit the full authoritative state — same contract.
  onPrecedence: (state: DraftPrecedenceState) => void;
  // Habit-tracker ops emit the full authoritative state — same contract.
  onHabits: (state: DraftHabitsState) => void;
  // Relocation ops emit the full ordered record list — same contract.
  onRelocations: (relocations: DraftRelocation[]) => void;
  // Settings ops emit the full settings object — same contract.
  onSettings: (settings: DraftSchedulingSettings) => void;
  // show_goals: display-only request to bring goals into the tree pane.
  onShow: (payload: { goalIds: string[]; all: boolean }) => void;
  // Tool activity (e.g. the model fetching goal trees) — for a progress hint
  // while a tool round trip runs.
  onStatus?: (payload: { tool: string; count: number }) => void;
  // stopReason plus the ground-truth ledger of tools that actually executed
  // this turn. The caller records the ledger into the stored history so later
  // turns can distinguish real edits from prose claims.
  onDone: (payload: {
    stopReason: string | null;
    toolsRun: { name: string; count: number }[];
  }) => void;
  onError: (message: string) => void;
}

export type RunAssistantTurnArgs = StreamDraftArgs & {
  // The user's own Anthropic API key, freshly read from the device vault.
  apiKey: string;
  baseURL?: string;
};
