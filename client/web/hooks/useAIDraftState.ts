"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getDraftConversation,
  listDraftConversations,
  upsertDraftConversation,
  type DraftConversationMessage,
} from "@/actions/draftConversations";
import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import { draftForestsEqual } from "@/utils/draft/diffDraftForest";
import { draftTemplatesEqual, type DraftTemplate } from "@/utils/draft/draftTemplates";
import {
  draftWindowsStateEqual,
  type DraftWindowsState,
} from "@/utils/draft/draftWindows";
import {
  draftPrecedenceStateEqual,
  type DraftPrecedenceState,
} from "@/utils/draft/draftPrecedence";
import {
  draftHabitsStateEqual,
  type DraftHabitsState,
} from "@/utils/draft/draftHabits";
import type { DraftRelocation } from "@/utils/draft/draftRelocations";
import {
  draftSettingsEqual,
  type DraftSchedulingSettings,
} from "@/utils/draft/draftSettings";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  // App-authored ledger of the tools that actually ran in this assistant
  // turn. Appended to the prose when history is sent to the model (so a later
  // turn can tell real edits from unbacked claims); never rendered in the
  // chat bubble.
  toolNote?: string;
  // Streaming assistant messages render with a live indicator until the
  // response completes.
  streaming?: boolean;
}

export interface UseAIDraftStateArgs {
  open: boolean;
  // True once the initial calendar snapshot has hydrated. Seeding waits for
  // it: a modal that is open before hydration (onboarding resumed on the AI
  // step, or mod+I in the first moments after load) would otherwise adopt an
  // EMPTY canonical as the working copy — every real item then diffs as
  // deleted, the model is sent an empty forest, and a save would actually
  // delete everything.
  ready: boolean;
  canonical: DraftForest;
  canonicalTemplates: DraftTemplate[];
  canonicalWindows: DraftWindowsState;
  canonicalPrecedence: DraftPrecedenceState;
  canonicalHabits: DraftHabitsState;
  canonicalSettings: DraftSchedulingSettings;
  // Adopt the most recent conversation on first open. Off for the onboarding
  // instance, which always starts on a fresh chat.
  autoResume?: boolean;
  // Adopt this specific conversation on first open (takes precedence over the
  // most-recent lookup). Used by the onboarding instance to survive a page
  // refresh without ever adopting an unrelated conversation. A missing or
  // deleted id degrades silently to a fresh chat.
  resumeConversationId?: string | null;
}

export interface UseAIDraftStateReturn {
  workingForest: DraftForest;
  setWorkingForest: (forest: DraftForest) => void;
  workingTemplates: DraftTemplate[];
  setWorkingTemplates: (templates: DraftTemplate[]) => void;
  workingWindows: DraftWindowsState;
  setWorkingWindows: (state: DraftWindowsState) => void;
  workingPrecedence: DraftPrecedenceState;
  setWorkingPrecedence: (state: DraftPrecedenceState) => void;
  workingHabits: DraftHabitsState;
  setWorkingHabits: (state: DraftHabitsState) => void;
  // Sanctioned cross-boundary moves (promote/demote/triage) recorded this
  // session — replayed on the canonical planner at Save, before the apply.
  workingRelocations: DraftRelocation[];
  setWorkingRelocations: (relocations: DraftRelocation[]) => void;
  workingSettings: DraftSchedulingSettings;
  setWorkingSettings: (settings: DraftSchedulingSettings) => void;
  hasForestChanges: boolean;
  hasTemplateChanges: boolean;
  hasWindowChanges: boolean;
  hasPrecedenceChanges: boolean;
  hasHabitChanges: boolean;
  hasSettingsChanges: boolean;
  hasChanges: boolean;

  messages: ChatMessage[];
  appendMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;

  conversationId: string;
  startNewConversation: () => void;
  adoptConversation: (payload: {
    id: string;
    messages: DraftConversationMessage[];
  }) => void;
  // True once the first-open resume attempt has resolved (adopted, skipped,
  // or failed). Auto-sends must wait for it or they race the adoption and
  // fork a second conversation.
  resumeSettled: boolean;
}

export function useAIDraftState({
  open,
  ready,
  canonical,
  canonicalTemplates,
  canonicalWindows,
  canonicalPrecedence,
  canonicalHabits,
  canonicalSettings,
  autoResume = true,
  resumeConversationId = null,
}: UseAIDraftStateArgs): UseAIDraftStateReturn {
  const [workingForest, setWorkingForestState] =
    useState<DraftForest>(canonical);
  const [workingTemplates, setWorkingTemplatesState] =
    useState<DraftTemplate[]>(canonicalTemplates);
  const [workingWindows, setWorkingWindowsState] =
    useState<DraftWindowsState>(canonicalWindows);
  const [workingPrecedence, setWorkingPrecedenceState] =
    useState<DraftPrecedenceState>(canonicalPrecedence);
  const [workingHabits, setWorkingHabitsState] =
    useState<DraftHabitsState>(canonicalHabits);
  const [workingRelocations, setWorkingRelocationsState] = useState<
    DraftRelocation[]
  >([]);
  const [workingSettings, setWorkingSettingsState] =
    useState<DraftSchedulingSettings>(canonicalSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Minted fresh per chat; becomes the DraftConversation row id on the first
  // persisted turn. Empty conversations never reach the DB.
  const [conversationId, setConversationId] = useState(() => uuidv4());

  // On modal open, adopt the current canonical as the working copy — unsaved
  // drafts follow WeekStructureModal's discard-on-close semantics. The chat
  // itself persists across close/reopen (the modal stays mounted in the
  // shell); "New chat" is the explicit reset.
  //
  // Waits for `ready` so an open-before-hydration modal reseeds the moment
  // the real data lands; layout effect so the reseed commits before paint
  // (no flash of every item badged as deleted).
  useLayoutEffect(() => {
    if (open && ready) {
      setWorkingForestState(canonical);
      setWorkingTemplatesState(canonicalTemplates);
      setWorkingWindowsState(canonicalWindows);
      setWorkingPrecedenceState(canonicalPrecedence);
      setWorkingHabitsState(canonicalHabits);
      setWorkingRelocationsState([]);
      setWorkingSettingsState(canonicalSettings);
    }
    // canonical* intentionally excluded — re-running on every planner,
    // template, or category change while the modal is open would blow away
    // in-flight AI edits.
  }, [open, ready]);

  const setWorkingForest = useCallback((forest: DraftForest) => {
    setWorkingForestState(forest);
  }, []);

  const setWorkingTemplates = useCallback((templates: DraftTemplate[]) => {
    setWorkingTemplatesState(templates);
  }, []);

  const setWorkingWindows = useCallback((state: DraftWindowsState) => {
    setWorkingWindowsState(state);
  }, []);

  const setWorkingPrecedence = useCallback((state: DraftPrecedenceState) => {
    setWorkingPrecedenceState(state);
  }, []);

  const setWorkingHabits = useCallback((state: DraftHabitsState) => {
    setWorkingHabitsState(state);
  }, []);

  const setWorkingRelocations = useCallback(
    (relocations: DraftRelocation[]) => {
      setWorkingRelocationsState(relocations);
    },
    [],
  );

  const setWorkingSettings = useCallback(
    (settings: DraftSchedulingSettings) => {
      setWorkingSettingsState(settings);
    },
    [],
  );

  // All three gate on `ready`: until the working copies have been seeded from
  // hydrated data, any apparent diff is the stale pre-hydration seed and must
  // not enable Save.
  const hasForestChanges = useMemo(() => {
    if (!ready || workingForest === canonical) return false;
    return !draftForestsEqual(workingForest, canonical);
  }, [ready, workingForest, canonical]);

  const hasTemplateChanges = useMemo(() => {
    if (!ready || workingTemplates === canonicalTemplates) return false;
    return !draftTemplatesEqual(workingTemplates, canonicalTemplates);
  }, [ready, workingTemplates, canonicalTemplates]);

  const hasWindowChanges = useMemo(() => {
    if (!ready || workingWindows === canonicalWindows) return false;
    return !draftWindowsStateEqual(workingWindows, canonicalWindows);
  }, [ready, workingWindows, canonicalWindows]);

  const hasPrecedenceChanges = useMemo(() => {
    if (!ready || workingPrecedence === canonicalPrecedence) return false;
    return !draftPrecedenceStateEqual(workingPrecedence, canonicalPrecedence);
  }, [ready, workingPrecedence, canonicalPrecedence]);

  const hasHabitChanges = useMemo(() => {
    if (!ready || workingHabits === canonicalHabits) return false;
    return !draftHabitsStateEqual(workingHabits, canonicalHabits);
  }, [ready, workingHabits, canonicalHabits]);

  const hasSettingsChanges = useMemo(() => {
    if (!ready || workingSettings === canonicalSettings) return false;
    return !draftSettingsEqual(workingSettings, canonicalSettings);
  }, [ready, workingSettings, canonicalSettings]);

  const hasChanges =
    hasForestChanges ||
    hasTemplateChanges ||
    hasWindowChanges ||
    hasPrecedenceChanges ||
    hasHabitChanges ||
    hasSettingsChanges;

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  // Guards against re-persisting content that is already in the DB — an
  // adopted conversation must not bump its own updatedAt (and reorder the
  // history list) just because it was loaded.
  const lastPersistedRef = useRef<string | null>(null);

  // Latest canonical state for the conversation-switch reset below. A ref so
  // startNewConversation/adoptConversation stay referentially stable.
  const canonicalRef = useRef({
    ready,
    canonical,
    canonicalTemplates,
    canonicalWindows,
    canonicalPrecedence,
    canonicalHabits,
    canonicalSettings,
  });
  useEffect(() => {
    canonicalRef.current = {
      ready,
      canonical,
      canonicalTemplates,
      canonicalWindows,
      canonicalPrecedence,
      canonicalHabits,
      canonicalSettings,
    };
  });

  // Pending drafts belong to the live session, not to a conversation — the
  // stored history is prose-only. Switching chats (History load or New chat)
  // therefore resets the working copies, so edits from the previous session
  // can't linger and masquerade as the loaded conversation's changes. Callers
  // confirm with the user first when there are unsaved changes.
  const resetWorkingToCanonical = useCallback(() => {
    const c = canonicalRef.current;
    if (!c.ready) return;
    setWorkingForestState(c.canonical);
    setWorkingTemplatesState(c.canonicalTemplates);
    setWorkingWindowsState(c.canonicalWindows);
    setWorkingPrecedenceState(c.canonicalPrecedence);
    setWorkingHabitsState(c.canonicalHabits);
    setWorkingRelocationsState([]);
    setWorkingSettingsState(c.canonicalSettings);
  }, []);

  const startNewConversation = useCallback(() => {
    setConversationId(uuidv4());
    setMessages([]);
    lastPersistedRef.current = null;
    resetWorkingToCanonical();
  }, [resetWorkingToCanonical]);

  const adoptConversation = useCallback(
    ({
      id,
      messages: adopted,
    }: {
      id: string;
      messages: DraftConversationMessage[];
    }) => {
      setConversationId(id);
      setMessages(adopted);
      lastPersistedRef.current = JSON.stringify([id, adopted]);
      resetWorkingToCanonical();
    },
    [resetWorkingToCanonical],
  );

  // Persistence: one debounced upsert whenever the chat settles (no message
  // streaming) with content the DB hasn't seen. Covers normal turns, aborted
  // turns, and multi-tool turns without threading saves through handleSend.
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.some((m) => m.streaming)) return;
    const settled: DraftConversationMessage[] = messages
      .filter((m) => m.content.trim().length > 0)
      .map(({ id, role, content, toolNote }) => ({
        id,
        role,
        content,
        ...(toolNote ? { toolNote } : {}),
      }));
    if (settled.length === 0) return;
    const serialized = JSON.stringify([conversationId, settled]);
    if (serialized === lastPersistedRef.current) return;

    const firstUserMessage = settled.find((m) => m.role === "user");
    const title = (firstUserMessage?.content ?? "Untitled").slice(0, 80);
    const timer = setTimeout(() => {
      lastPersistedRef.current = serialized;
      // Fire-and-forget: a failed save costs this turn's history entry, not
      // the conversation itself.
      upsertDraftConversation({
        id: conversationId,
        title,
        messages: settled,
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [messages, conversationId]);

  // Resume on the first open of a fresh page load: a specific conversation
  // when the caller pinned one, else the most recent so "shut down and
  // reopen" lands where the user left off. Any failure degrades silently to
  // an empty chat.
  const resumeAttemptedRef = useRef(false);
  const [resumeSettled, setResumeSettled] = useState(false);
  const messageCountRef = useRef(0);
  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages]);
  useEffect(() => {
    if (!open || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    if ((!autoResume && !resumeConversationId) || messageCountRef.current > 0) {
      setResumeSettled(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let targetId = resumeConversationId;
        if (!targetId) {
          const list = await listDraftConversations();
          if (cancelled || list.length === 0) return;
          targetId = list[0].id;
        }
        const conversation = await getDraftConversation(targetId);
        if (cancelled || messageCountRef.current > 0) return;
        adoptConversation({
          id: conversation.id,
          messages: conversation.messages,
        });
      } catch {
        // No history, deleted conversation, or fetch failure — start empty.
      } finally {
        if (!cancelled) setResumeSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, autoResume, resumeConversationId, adoptConversation]);

  return {
    workingForest,
    setWorkingForest,
    workingTemplates,
    setWorkingTemplates,
    workingWindows,
    setWorkingWindows,
    workingPrecedence,
    setWorkingPrecedence,
    workingHabits,
    setWorkingHabits,
    workingRelocations,
    setWorkingRelocations,
    workingSettings,
    setWorkingSettings,
    hasForestChanges,
    hasTemplateChanges,
    hasWindowChanges,
    hasPrecedenceChanges,
    hasHabitChanges,
    hasSettingsChanges,
    hasChanges,
    messages,
    appendMessage,
    updateMessage,
    conversationId,
    startNewConversation,
    adoptConversation,
    resumeSettled,
  };
}
