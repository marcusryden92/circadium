"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { assignInlineVars } from "@vanilla-extract/dynamic";
import { v4 as uuidv4 } from "uuid";
import { format } from "date-fns";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  Button,
  Grain,
  ConfirmModal,
  SegmentedControl,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { plannerForestToJson } from "@/utils/draft/plannerForestToJson";
import { historyMessages } from "@/utils/historyMessages";
import { captureEvent } from "@/utils/analytics";
import { JsonForestView } from "@/components/draft/JsonTreeView";
import { TemplateWeekView } from "@/components/draft/TemplateWeekView";
import { ChatPane } from "@/components/draft/ChatPane";
import { ChatHistoryPopover } from "@/components/draft/ChatHistoryPopover";
import { useAIDraftState } from "@/hooks/useAIDraftState";
import type { DraftConversationMessage } from "@/actions/draftConversations";
import { useAiAccess } from "@/components/ui";
import type {
  StreamChatMessage,
  StreamDraftFocus,
} from "@/utils/draft/assistantEngine";
import {
  normalizeDraftForest,
  type DraftForestProposal,
} from "@/utils/draft/normalizeDraftForest";
import { foldDraftProposals } from "@/utils/draft/mergeDraftForest";
import {
  applyDraftForestToPlanner,
  clampReadinessAgainstDependencies,
} from "@/utils/draft/applyDraftForestToPlanner";
import { applyDraftTemplates } from "@/utils/draft/applyDraftTemplates";
import { applyDraftWindows } from "@/utils/draft/applyDraftWindows";
import { applyDraftPrecedence } from "@/utils/draft/applyDraftPrecedence";
import { templatesToDraft } from "@/utils/draft/draftTemplates";
import { categoriesToDraftWindows } from "@/utils/draft/draftWindows";
import { precedenceToDraft } from "@/utils/draft/draftPrecedence";
import {
  countTemplateChanges,
  diffDraftTemplates,
} from "@/utils/draft/diffDraftTemplates";
import {
  countWindowChanges,
  diffDraftWindows,
} from "@/utils/draft/diffDraftWindows";
import {
  countPrecedenceChanges,
  diffDraftPrecedence,
} from "@/utils/draft/diffDraftPrecedence";
import { habitsToDraftState } from "@/utils/draft/draftHabits";
import { parsePlanRecurrence } from "@/utils/planRecurrence";
import {
  countHabitChanges,
  diffDraftHabits,
} from "@/utils/draft/diffDraftHabits";
import { buildHabitChangeSet } from "@/utils/draft/applyDraftHabits";
import { applyHabitChanges } from "@/actions/habits";
import { hydrateHabits } from "@/redux/slices/habitsSlice";
import { WindowsView } from "@/components/draft/WindowsView";
import { PrecedenceView } from "@/components/draft/PrecedenceView";
import { HabitsView } from "@/components/draft/HabitsView/HabitsView";
import { AssistantGate } from "@/components/draft/AssistantGate";
import { diffDraftForest } from "@/utils/draft/diffDraftForest";
import { diffSubtreeHasChanges } from "@/utils/draft/diffDraftTree";

import {
  overlay,
  modal,
  embeddedRoot,
  banner,
  editingLabel,
  bannerSpacer,
  cancelButtonStyle,
  body,
  mobilePaneSwitch,
  paneMobileHidden,
  chatPane,
  chatBasisVar,
  treePane,
  paneDivider,
  paneHeader,
  paneHeaderSection,
  paneSubheaderSection,
  paneTitle,
  paneSubtitle,
  paneTab,
  paneTabLabel,
  tabChangeCount,
  headerActionButton,
  headerActionCluster,
  a11yHiddenTitle,
} from "./AIDraftModal.css";

type DraftPaneTab = "goals" | "week" | "windows" | "queues" | "habits";
type MobilePane = "chat" | "review";

export interface AIDraftFocus {
  rootId: string | null;
  itemId: string | null;
}

function formatDirtyDomains(
  forest: boolean,
  templates: boolean,
  windows: boolean,
  precedence: boolean,
  habits: boolean,
): string {
  const parts = [
    forest ? "goals" : null,
    templates ? "weekly schedule" : null,
    windows ? "category windows" : null,
    precedence ? "queues" : null,
    habits ? "habits" : null,
  ].filter((p): p is string => p !== null);
  if (parts.length <= 1) return parts[0] ?? "plan";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

interface AIDraftModalProps {
  open: boolean;
  onClose: () => void;
  focus?: AIDraftFocus | null;
  initialPrompt?: string | null;
  // Programmatic session hint (e.g. "onboarding") — forwarded to the route for
  // a prompt preamble, and used to tune the onboarding instance (empty-state
  // hint, no History popover, no auto-resume).
  intent?: string | null;
  // Embedded mode (onboarding AI step): renders inline in the host's container
  // with no Dialog overlay and no save/cancel banner. The host drives saving
  // via the reported `save` fn and is told when saving finished via onSaved.
  embedded?: boolean;
  onSaved?: () => void;
  onStateChange?: (state: {
    hasChanges: boolean;
    isStreaming: boolean;
    save: () => void;
  }) => void;
  // Adopt this specific conversation on first open (survives a page refresh
  // mid-onboarding); a missing id degrades to a fresh chat + kickoff.
  resumeConversationId?: string | null;
  // Reports the active conversation id so the host can persist it for resume.
  onConversationIdChange?: (id: string) => void;
}

export function AIDraftModal({
  open,
  onClose,
  focus,
  initialPrompt,
  intent,
  embedded = false,
  onSaved,
  onStateChange,
  resumeConversationId = null,
  onConversationIdChange,
}: AIDraftModalProps) {
  const {
    planner,
    categories,
    template,
    locations,
    queues,
    dependencies,
    updateAll,
    userId,
    isLoaded,
  } = useCalendarProvider();
  const { status: aiStatus, getApiKey } = useAiAccess();
  const dispatch = useDispatch<AppDispatch>();
  // Habit trackers live outside the OCC sync (their own slice, direct
  // actions), so the modal reads them straight from Redux rather than the
  // calendar provider.
  const habitBucketRows = useSelector((s: RootState) => s.habits.buckets);
  const habitRows = useSelector((s: RootState) => s.habits.habits);
  const habitItemRows = useSelector((s: RootState) => s.habits.items);
  // Unsaved-changes confirm covers three destructive intents: closing the
  // modal, starting a new chat, and loading another conversation — the latter
  // two reset the working drafts (drafts belong to the session, not the chat).
  const [discardIntent, setDiscardIntent] = useState<
    | { kind: "close" }
    | { kind: "new" }
    | {
        kind: "adopt";
        payload: { id: string; messages: DraftConversationMessage[] };
      }
    | null
  >(null);
  const [chatBasisPct, setChatBasisPct] = useState(50);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const onDividerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const bodyRect = bodyRef.current?.getBoundingClientRect();
      if (!bodyRect) return;
      const startX = e.clientX;
      const startPct = chatBasisPct;
      const bodyWidth = bodyRect.width;
      setIsDraggingDivider(true);

      const onMove = (ev: PointerEvent) => {
        const deltaX = ev.clientX - startX;
        const deltaPct = (deltaX / bodyWidth) * 100;
        // Clamp to keep both panes usable; matches the CSS minWidth on each.
        setChatBasisPct(Math.max(20, Math.min(80, startPct + deltaPct)));
      };
      const onUp = () => {
        setIsDraggingDivider(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [chatBasisPct],
  );

  const onDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? -4 : e.key === "ArrowRight" ? 4 : null;
    if (step === null) return;
    e.preventDefault();
    setChatBasisPct((prev) => Math.max(20, Math.min(80, prev + step)));
  }, []);

  const canonical = useMemo(() => plannerForestToJson(planner), [planner]);
  const canonicalTemplates = useMemo(
    () => templatesToDraft(template),
    [template],
  );
  const canonicalWindows = useMemo(
    () => categoriesToDraftWindows(categories),
    [categories],
  );
  const canonicalPrecedence = useMemo(
    () => precedenceToDraft(queues, dependencies),
    [queues, dependencies],
  );
  const canonicalHabits = useMemo(
    () => habitsToDraftState(habitBucketRows, habitRows, habitItemRows),
    [habitBucketRows, habitRows, habitItemRows],
  );
  // Habit items must repeat; plan recurrence lives outside the forest
  // contract, so recurring plans are identified for the engine by id. Static
  // per turn — the assistant cannot edit plan recurrence.
  const recurringPlanIds = useMemo(
    () =>
      planner
        .filter(
          (p) =>
            !p.parentId &&
            p.isTriaged &&
            p.plannerType === "plan" &&
            parsePlanRecurrence(p.recurrence) !== null,
        )
        .map((p) => p.id),
    [planner],
  );

  const {
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
    hasForestChanges,
    hasTemplateChanges,
    hasWindowChanges,
    hasPrecedenceChanges,
    hasHabitChanges,
    hasChanges,
    messages,
    appendMessage,
    updateMessage,
    conversationId,
    startNewConversation,
    adoptConversation,
    resumeSettled,
  } = useAIDraftState({
    open,
    ready: isLoaded,
    canonical,
    canonicalTemplates,
    canonicalWindows,
    canonicalPrecedence,
    canonicalHabits,
    autoResume: intent !== "onboarding",
    resumeConversationId,
  });

  // Wait for the resume attempt: reporting the freshly minted id while the
  // stored conversation is still being fetched would overwrite the very id
  // the host needs for the next refresh.
  useEffect(() => {
    if (!resumeSettled) return;
    onConversationIdChange?.(conversationId);
  }, [resumeSettled, conversationId, onConversationIdChange]);

  // Recompute on every working/canonical tick. Cheap: pure walks of
  // personal-scale data, no memo cost worth introducing.
  const diffedGoals = diffDraftForest(workingForest, canonical);
  const diffedTemplates = diffDraftTemplates(
    workingTemplates,
    canonicalTemplates,
  );
  const diffedWindows = diffDraftWindows(workingWindows, canonicalWindows);
  const diffedPrecedence = diffDraftPrecedence(
    workingPrecedence,
    canonicalPrecedence,
  );
  const diffedHabits = diffDraftHabits(canonicalHabits, workingHabits);
  const goalChangeCount = diffedGoals.filter(diffSubtreeHasChanges).length;
  const templateChangeCount = countTemplateChanges(diffedTemplates);
  const windowChangeCount = countWindowChanges(diffedWindows);
  const precedenceChangeCount = countPrecedenceChanges(diffedPrecedence);
  const habitChangeCount = countHabitChanges(diffedHabits);
  const reviewChangeCount =
    goalChangeCount +
    templateChangeCount +
    windowChangeCount +
    precedenceChangeCount +
    habitChangeCount;

  // Member and dependency endpoints are top-level items; working roots cover
  // drafts, canonical roots cover rows deleted in the working copy.
  const precedenceTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const goal of canonical.goals) map.set(goal.id, goal.title);
    for (const goal of workingForest.goals) map.set(goal.id, goal.title);
    return map;
  }, [canonical, workingForest]);
  const categoryNameById = useMemo(
    () => new Map(workingWindows.categories.map((c) => [c.id, c.name])),
    [workingWindows],
  );

  // Goals / Week tabs. During a stream the pane follows the assistant's work
  // (last streamed domain wins) unless the user clicked a tab this turn; the
  // pin resets on each send.
  const [activeTab, setActiveTab] = useState<DraftPaneTab>("goals");
  const tabPinnedRef = useRef(false);
  const selectTab = useCallback((tab: DraftPaneTab) => {
    tabPinnedRef.current = true;
    setActiveTab(tab);
  }, []);
  const autoSwitchTab = useCallback((tab: DraftPaneTab) => {
    if (!tabPinnedRef.current) setActiveTab(tab);
  }, []);
  // On mobile only one pane renders at a time (CSS hides the other); this is
  // a render filter only — the hidden pane stays mounted so streams and
  // working state keep flowing.
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");
  useEffect(() => {
    if (open) {
      setActiveTab("goals");
      tabPinnedRef.current = false;
      setMobilePane("chat");
    }
  }, [open]);

  // The tree pane shows a relevance-scoped subset: the focused goal, goals
  // the AI touched (any diff status in the subtree), and goals brought into
  // view via show_goals — with a manual show-all escape hatch. The working
  // forest itself always stays complete; this is a render filter only, so
  // Save/delete semantics are unaffected.
  const [showAll, setShowAll] = useState(false);
  const [shownGoalIds, setShownGoalIds] = useState<Set<string>>(new Set());
  const focusRootId = focus?.rootId ?? null;
  useEffect(() => {
    if (open) {
      setShowAll(false);
      setShownGoalIds(focusRootId ? new Set([focusRootId]) : new Set());
    }
  }, [open, focusRootId]);

  const visibleGoals = showAll
    ? diffedGoals
    : diffedGoals.filter(
        (g) => shownGoalIds.has(g.id) || diffSubtreeHasChanges(g),
      );
  const hiddenCount = diffedGoals.length - visibleGoals.length;

  // Keep the latest working state in refs so the send callback always reads
  // fresh state without having to be recreated on every tick.
  const workingForestRef = useRef(workingForest);
  useEffect(() => {
    workingForestRef.current = workingForest;
  }, [workingForest]);

  const workingTemplatesRef = useRef(workingTemplates);
  useEffect(() => {
    workingTemplatesRef.current = workingTemplates;
  }, [workingTemplates]);

  const workingWindowsRef = useRef(workingWindows);
  useEffect(() => {
    workingWindowsRef.current = workingWindows;
  }, [workingWindows]);

  const workingPrecedenceRef = useRef(workingPrecedence);
  useEffect(() => {
    workingPrecedenceRef.current = workingPrecedence;
  }, [workingPrecedence]);

  const workingHabitsRef = useRef(workingHabits);
  useEffect(() => {
    workingHabitsRef.current = workingHabits;
  }, [workingHabits]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isStreaming = messages.some((m) => m.streaming);

  // Abort any in-flight stream when the modal closes.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  const handleSend = useCallback(
    async (content: string) => {
      // Pre-hydration the working forest is a stale empty seed — a send would
      // show the model no goals. The window is sub-second; drop the click.
      if (!isLoaded) return;
      // The gate replaces the chat UI whenever AI isn't ready, so this only
      // trips on races (key removed in another tab mid-session).
      if (aiStatus !== "ready") return;
      captureEvent("assistant_message_sent", { embedded });
      const userMessageId = uuidv4();
      const assistantMessageId = uuidv4();

      // Tool-only turns can leave an assistant message with empty content;
      // the server rejects empty history entries, so drop them here.
      const history: StreamChatMessage[] = [
        ...messagesRef.current
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        { role: "user", content },
      ];

      appendMessage({ id: userMessageId, role: "user", content });
      appendMessage({
        id: assistantMessageId,
        role: "assistant",
        content: "",
        streaming: true,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      // Snapshot the working forest once per send. Every propose_goals call
      // streams partial re-parses keyed by callIndex; folding the latest
      // snapshot of each call over this same base means re-parses replace
      // (never compound) while multiple calls in one turn still stack.
      const turnStartForest = workingForestRef.current;
      const proposalsByCall = new Map<number, DraftForestProposal>();
      const completedCalls = new Set<number>();
      setStreamStatus(null);
      tabPinnedRef.current = false;
      const streamFocus: StreamDraftFocus | null = focus?.rootId
        ? { rootId: focus.rootId, itemId: focus.itemId ?? null }
        : null;

      let assistantText = "";
      let sawForest = false;
      let sawTemplates = false;
      let sawWindows = false;
      let sawPrecedence = false;
      let sawHabits = false;
      let sawShow = false;
      let finished = false;
      // Categories ride from the WORKING state, not the provider — pending
      // drafts (created categories, renames, moved windows, flag changes)
      // must be visible to the model on the next turn.
      const windowsState = workingWindowsRef.current;
      // The key lives encrypted on this device only; read it per send and
      // hand it straight to the engine — never into React state.
      const apiKey = await getApiKey();
      if (!apiKey) {
        setStreamStatus(null);
        updateMessage(assistantMessageId, {
          content:
            "[Error: Your API key isn't on this device — add it under Settings → AI assistant.]",
          streaming: false,
        });
        if (abortRef.current === controller) abortRef.current = null;
        return;
      }
      // Dynamic import keeps the Anthropic SDK + tool-loop out of the shell
      // bundle until the first send.
      const { runAssistantTurn } = await import(
        "@/utils/draft/assistantEngine"
      );
      await runAssistantTurn({
        apiKey,
        currentForest: turnStartForest,
        currentTemplates: workingTemplatesRef.current,
        currentPrecedence: workingPrecedenceRef.current,
        currentHabits: workingHabitsRef.current,
        recurringPlanIds,
        history,
        focus: streamFocus,
        categories: windowsState.categories.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          parentId: c.parentId,
          locationId: c.locationId,
          isStrict: c.isStrict,
          useTimeWindows: c.useTimeWindows,
          confineToOwnWindows: c.confineToOwnWindows,
          timeSlots: windowsState.windows
            .filter((w) => w.categoryId === c.id)
            .map((w) => ({
              id: w.id,
              day: w.day,
              startTime: w.startTime,
              endTime: w.endTime,
            })),
        })),
        locations: locations.map((l) => ({ id: l.id, name: l.name })),
        // Local date, not server UTC — deadlines are user-local decisions.
        today: format(new Date(), "yyyy-MM-dd"),
        intent,
        signal: controller.signal,
        onText: (delta) => {
          assistantText += delta;
          setStreamStatus(null);
          updateMessage(assistantMessageId, { content: assistantText });
        },
        onForest: ({ callIndex, proposal: raw, complete }) => {
          sawForest = true;
          const proposal = normalizeDraftForest(raw);
          if (proposal) {
            proposalsByCall.set(callIndex, proposal);
            if (complete) completedCalls.add(callIndex);
            const ordered = [...proposalsByCall.keys()]
              .sort((a, b) => a - b)
              .map((idx) => proposalsByCall.get(idx)!);
            setWorkingForest(foldDraftProposals(turnStartForest, ordered));
            autoSwitchTab("goals");
          }
        },
        onTemplates: (templates) => {
          sawTemplates = true;
          // Full authoritative array from the server's working copy — replace
          // wholesale, no folding.
          setWorkingTemplates(templates);
          autoSwitchTab("week");
        },
        onWindows: (state) => {
          sawWindows = true;
          setWorkingWindows(state);
          autoSwitchTab("windows");
        },
        onPrecedence: (state) => {
          sawPrecedence = true;
          setWorkingPrecedence(state);
          autoSwitchTab("queues");
        },
        onHabits: (state) => {
          sawHabits = true;
          setWorkingHabits(state);
          autoSwitchTab("habits");
        },
        onStatus: ({ tool, count }) => {
          const plural = count === 1 ? "" : "s";
          const habitLabel =
            tool === "add_habits"
              ? `creating ${count} habit${plural}…`
              : tool === "update_habits"
                ? `editing ${count} habit${plural}…`
                : tool === "delete_habits"
                  ? `deleting ${count} habit${plural}…`
                  : tool === "add_habit_buckets"
                    ? `creating ${count} bucket${plural}…`
                    : tool === "update_habit_buckets"
                      ? `editing ${count} bucket${plural}…`
                      : tool === "delete_habit_buckets"
                        ? `deleting ${count} bucket${plural}…`
                        : tool === "add_habit_items" ||
                            tool === "remove_habit_items"
                          ? "updating tracked items…"
                          : null;
          if (habitLabel) {
            setStreamStatus(habitLabel);
            return;
          }
          const label =
            tool === "get_goal_trees"
              ? `reading ${count} goal${plural}…`
              : tool === "search_items"
                ? "searching…"
                : tool === "update_items"
                  ? `editing ${count} item${plural}…`
                  : tool === "move_item"
                    ? "moving an item…"
                    : tool === "add_items"
                      ? `adding ${count} item${plural}…`
                      : tool === "delete_items"
                        ? `deleting ${count} item${plural}…`
                        : tool === "add_templates"
                          ? `adding ${count} template${plural}…`
                          : tool === "update_templates"
                            ? `editing ${count} template${plural}…`
                            : tool === "delete_templates"
                              ? `deleting ${count} template${plural}…`
                              : tool === "add_time_windows"
                                ? `adding ${count} window${plural}…`
                                : tool === "update_time_windows"
                                  ? `editing ${count} window${plural}…`
                                  : tool === "delete_time_windows"
                                    ? `deleting ${count} window${plural}…`
                                    : tool === "update_categories"
                                      ? `updating ${count} categor${count === 1 ? "y" : "ies"}…`
                                      : tool === "add_queues"
                                        ? `creating ${count} queue${plural}…`
                                        : tool === "update_queues"
                                          ? `editing ${count} queue${plural}…`
                                          : tool === "delete_queues"
                                            ? `deleting ${count} queue${plural}…`
                                            : tool === "add_queue_members"
                                              ? `queueing ${count} item${plural}…`
                                              : tool === "move_queue_member"
                                                ? "reordering a queue…"
                                                : tool ===
                                                    "remove_queue_members"
                                                  ? `unqueueing ${count} item${plural}…`
                                                  : tool === "add_dependencies"
                                                    ? `linking ${count} dependenc${count === 1 ? "y" : "ies"}…`
                                                    : tool ===
                                                        "remove_dependencies"
                                                      ? `unlinking ${count} dependenc${count === 1 ? "y" : "ies"}…`
                                                      : null;
          if (label) setStreamStatus(label);
        },
        onShow: ({ goalIds, all }) => {
          sawShow = true;
          autoSwitchTab("goals");
          if (all) setShowAll(true);
          else if (goalIds.length > 0) {
            // A specific-goal show reads as narrowing ("open just X"), so it
            // also exits show-all mode; ids still union across turns.
            setShowAll(false);
            setShownGoalIds((prev) => new Set([...prev, ...goalIds]));
          }
        },
        onDone: () => {
          finished = true;
          setStreamStatus(null);
          // A tool-only turn produces no prose; fill the bubble so it isn't
          // blank (this fallback also enters future history as the
          // assistant's reply).
          const touchedTabs = [
            sawForest ? "Goals" : null,
            sawTemplates ? "Week" : null,
            sawWindows ? "Categories" : null,
            sawPrecedence ? "Queues" : null,
            sawHabits ? "Habits" : null,
          ].filter((t): t is string => t !== null);
          const fallback =
            touchedTabs.length > 0
              ? `Proposed changes — review the ${touchedTabs.join(" and ")} tab${
                  touchedTabs.length === 1 ? "" : "s"
                }.`
              : sawShow
                ? "Brought them into view in the goals pane."
                : "Done.";
          updateMessage(assistantMessageId, {
            streaming: false,
            ...(assistantText.trim().length === 0 ? { content: fallback } : {}),
          });
        },
        onError: (message) => {
          finished = true;
          setStreamStatus(null);
          updateMessage(assistantMessageId, {
            content:
              assistantText.length > 0
                ? `${assistantText}\n\n[Error: ${message}]`
                : `[Error: ${message}]`,
            streaming: false,
          });
        },
      });

      // An aborted stream (Stop button or modal close) resolves without
      // reaching onDone/onError. Completed work stays, but a propose_goals
      // call cut off mid-stream leaves a truncated tree in the fold — refold
      // with only the calls whose finalized emit arrived before the abort.
      if (!finished) {
        setStreamStatus(null);
        if (completedCalls.size < proposalsByCall.size) {
          const completeOrdered = [...proposalsByCall.keys()]
            .filter((idx) => completedCalls.has(idx))
            .sort((a, b) => a - b)
            .map((idx) => proposalsByCall.get(idx)!);
          setWorkingForest(
            foldDraftProposals(turnStartForest, completeOrdered),
          );
        }
        updateMessage(assistantMessageId, {
          streaming: false,
          ...(assistantText.trim().length === 0 ? { content: "Stopped." } : {}),
        });
      }

      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    },
    [
      isLoaded,
      aiStatus,
      getApiKey,
      appendMessage,
      updateMessage,
      setWorkingForest,
      setWorkingTemplates,
      setWorkingWindows,
      setWorkingPrecedence,
      setWorkingHabits,
      autoSwitchTab,
      focus,
      categories,
      locations,
      recurringPlanIds,
      intent,
      embedded,
    ],
  );

  // Onboarding auto-kickoff: the brain-dump step promises the assistant will
  // do the sorting, so open the interview unprompted instead of waiting for
  // the user to compose a first message. Fires once per mount, only on a
  // fresh conversation once the resume attempt has settled (a refresh
  // mid-onboarding resumes the stored conversation instead), and only after
  // hydration (sends are dropped before isLoaded).
  const kickoffSentRef = useRef(false);
  useEffect(() => {
    if (intent !== "onboarding" || !open || !isLoaded || !resumeSettled) return;
    if (aiStatus !== "ready") return;
    if (kickoffSentRef.current || messages.length > 0) return;
    kickoffSentRef.current = true;
    void handleSend(
      canonical.goals.length > 0
        ? "Please help me sort out the things I wrote down and get them ready to schedule."
        : "I haven't written anything down yet — help me figure out what I should be working on.",
    );
  }, [
    intent,
    open,
    isLoaded,
    resumeSettled,
    aiStatus,
    messages.length,
    canonical.goals.length,
    handleSend,
  ]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const requestClose = useCallback(() => {
    if (hasChanges) {
      setDiscardIntent({ kind: "close" });
      return;
    }
    onClose();
  }, [hasChanges, onClose]);

  // Chat switches reset the working drafts (useAIDraftState), so with unsaved
  // changes they route through the same discard confirm as closing. Embedded
  // (onboarding) has no ConfirmModal — it keeps the old direct behavior.
  const requestNewConversation = useCallback(() => {
    if (hasChanges && !embedded) {
      setDiscardIntent({ kind: "new" });
      return;
    }
    startNewConversation();
  }, [hasChanges, embedded, startNewConversation]);

  const requestAdoptConversation = useCallback(
    (payload: { id: string; messages: DraftConversationMessage[] }) => {
      if (hasChanges && !embedded) {
        setDiscardIntent({ kind: "adopt", payload });
        return;
      }
      adoptConversation(payload);
    },
    [hasChanges, embedded, adoptConversation],
  );

  const handleSave = useCallback(() => {
    if (!hasChanges || !userId || !isLoaded) return;
    // Clean domains pass undefined so their state keeps identity — one
    // updateAll call means one engine regen and one sync for all domains.
    const now = new Date().toISOString();
    // Categories first: the forest apply validates goal categoryIds against
    // the SAVED category set, so a goal filed under a category created in
    // this same conversation keeps its assignment instead of being nulled.
    const nextCategories = hasWindowChanges
      ? applyDraftWindows({
          currentCategories: categories,
          canonical: canonicalWindows,
          working: workingWindows,
          userId,
          now,
        })
      : undefined;
    const categoriesForForest = nextCategories ?? categories;
    // Forest before precedence: queue members and dependency endpoints may
    // reference goals created this conversation, and their permanent ids only
    // exist once the forest apply mints them (reported through nodeIdMap —
    // all levels, so node-level dependency endpoints survive delete+recreate
    // paths too).
    const nodeIdMap = new Map<string, string>();
    const nextPlanner = hasForestChanges
      ? applyDraftForestToPlanner({
          planner,
          workingForest,
          userId,
          validCategoryIds: new Set(categoriesForForest.map((c) => c.id)),
          validLocationIds: new Set(locations.map((l) => l.id)),
          categoryColorById: new Map(
            categoriesForForest.map((c) => [c.id, c.color]),
          ),
          dependencies,
          nodeIdMap,
        })
      : undefined;
    const nextTemplates = hasTemplateChanges
      ? applyDraftTemplates({
          current: template,
          canonical: canonicalTemplates,
          working: workingTemplates,
          userId,
          now,
        })
      : undefined;
    let plannerForSync = nextPlanner;
    let nextQueues: typeof queues | undefined;
    let nextDependencies: typeof dependencies | undefined;
    if (hasPrecedenceChanges) {
      const applied = applyDraftPrecedence({
        currentQueues: queues,
        currentDependencies: dependencies,
        canonical: canonicalPrecedence,
        working: workingPrecedence,
        nodeIdMap,
        nextPlanner: plannerForSync ?? planner,
        validCategoryIds: new Set(categoriesForForest.map((c) => c.id)),
        userId,
        now,
      });
      nextQueues = applied.queues;
      nextDependencies = applied.dependencies;
      // Assistant-created dependencies exist only now (with permanent ids),
      // so the forest apply's readiness clamp could not see them — re-run it
      // against the final edge set.
      const clamped = clampReadinessAgainstDependencies(
        plannerForSync ?? planner,
        applied.dependencies,
        now,
      );
      if (clamped !== (plannerForSync ?? planner)) plannerForSync = clamped;
    }
    updateAll(
      plannerForSync,
      undefined,
      nextTemplates,
      nextCategories,
      nextQueues,
      nextDependencies,
      { label: historyMessages.assistant.save },
    );
    // Habits are out-of-band (direct actions, never the OCC sync): replay the
    // assistant's delta on the server after the forest apply so draft item
    // ids resolve through nodeIdMap, then mirror the fresh state wholesale.
    // Fire-and-forget — a failure costs only the habit delta; everything else
    // persisted through the normal sync above.
    if (hasHabitChanges) {
      const changes = buildHabitChangeSet({
        canonical: canonicalHabits,
        working: workingHabits,
        currentBuckets: habitBucketRows,
        currentHabits: habitRows,
        currentItems: habitItemRows,
        nextPlanner: plannerForSync ?? planner,
        nodeIdMap,
      });
      if (changes) {
        void applyHabitChanges(changes)
          .then((fresh) => dispatch(hydrateHabits(fresh)))
          .catch(() => {});
      }
    }
    captureEvent("assistant_draft_saved", {
      embedded,
      goals: hasForestChanges,
      templates: hasTemplateChanges,
      categories: hasWindowChanges,
      precedence: hasPrecedenceChanges,
      habits: hasHabitChanges,
    });
    if (embedded) onSaved?.();
    else onClose();
  }, [
    workingForest,
    workingTemplates,
    workingWindows,
    workingPrecedence,
    workingHabits,
    canonicalTemplates,
    canonicalWindows,
    canonicalPrecedence,
    canonicalHabits,
    hasChanges,
    hasForestChanges,
    hasTemplateChanges,
    hasWindowChanges,
    hasPrecedenceChanges,
    hasHabitChanges,
    habitBucketRows,
    habitRows,
    habitItemRows,
    dispatch,
    userId,
    isLoaded,
    planner,
    template,
    categories,
    locations,
    queues,
    dependencies,
    updateAll,
    onClose,
    embedded,
    onSaved,
  ]);

  // In embedded mode the host (onboarding) owns the Save action, so surface the
  // current dirty/streaming state and a save handle it can call from its own
  // footer.
  useEffect(() => {
    if (!embedded) return;
    onStateChange?.({ hasChanges, isStreaming, save: handleSave });
  }, [embedded, hasChanges, isStreaming, handleSave, onStateChange]);

  const content = (
    <>
      <Grain />

      {!embedded && (
        <div className={banner}>
          <span className={editingLabel}>ai assistant</span>
          <span className={bannerSpacer} />
          <Button
            variant="ghost"
            size="sm"
            onClick={requestClose}
            className={cancelButtonStyle}
          >
            {hasChanges ? "Cancel" : "Close"}
          </Button>
          <Button
            variant="solidLight"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isStreaming || !userId}
          >
            {hasChanges ? "Save changes" : "Save"}
          </Button>
        </div>
      )}

      <div className={mobilePaneSwitch}>
        <SegmentedControl<MobilePane>
          options={[
            { key: "chat", label: "Chat" },
            {
              key: "review",
              label: (
                <>
                  Review
                  {reviewChangeCount > 0 && (
                    <span className={tabChangeCount}>{reviewChangeCount}</span>
                  )}
                </>
              ),
            },
          ]}
          value={mobilePane}
          onChange={setMobilePane}
        />
      </div>

      {/* ph-no-capture: assistant content (chat + drafts) stays out of session replay */}
      <div className={`${body} ph-no-capture`} ref={bodyRef}>
        <div
          className={`${chatPane} ${
            mobilePane === "chat" ? "" : paneMobileHidden
          }`}
          style={assignInlineVars({ [chatBasisVar]: `${chatBasisPct}%` })}
        >
          <div className={paneHeader}>
            <h2 className={paneTitle}>Chat</h2>
            <span className={paneSubtitle}>
              {isStreaming
                ? (streamStatus ?? "assistant is thinking…")
                : "send a prompt to begin"}
            </span>
            <span className={headerActionCluster}>
              {intent !== "onboarding" && (
                <ChatHistoryPopover
                  currentConversationId={conversationId}
                  disabled={isStreaming}
                  onAdopt={requestAdoptConversation}
                  onDeletedCurrent={startNewConversation}
                />
              )}
              {messages.length > 0 && !isStreaming && (
                <button
                  type="button"
                  className={headerActionButton}
                  onClick={requestNewConversation}
                >
                  New chat
                </button>
              )}
            </span>
          </div>
          <ChatPane
            messages={messages}
            onSend={handleSend}
            onStop={handleStop}
            isStreaming={isStreaming}
            initialDraft={open ? (initialPrompt ?? null) : null}
            emptyHint={
              intent === "onboarding" ? (
                <>
                  The assistant can create, edit, and expand your goals and
                  items — just describe what you want.
                  <br />
                  Ask it to turn what you jotted down into real goals, break
                  them into steps, or set deadlines and durations. Nothing is
                  saved until you continue.
                </>
              ) : undefined
            }
          />
        </div>
        <div
          className={paneDivider}
          data-dragging={isDraggingDivider ? "true" : undefined}
          onPointerDown={onDividerPointerDown}
          onKeyDown={onDividerKeyDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat / tree panes"
          tabIndex={0}
        />
        <div
          className={`${treePane} ${
            mobilePane === "review" ? "" : paneMobileHidden
          }`}
        >
          <div className={paneHeader}>
            <div className={paneHeaderSection}>
              <button
                type="button"
                className={paneTab}
                data-active={activeTab === "goals" ? "true" : undefined}
                onClick={() => selectTab("goals")}
              >
                <span className={paneTabLabel}>Goals</span>
                {goalChangeCount > 0 && (
                  <span className={tabChangeCount}>{goalChangeCount}</span>
                )}
              </button>
              <button
                type="button"
                className={paneTab}
                data-active={activeTab === "week" ? "true" : undefined}
                onClick={() => selectTab("week")}
              >
                <span className={paneTabLabel}>Week</span>
                {templateChangeCount > 0 && (
                  <span className={tabChangeCount}>{templateChangeCount}</span>
                )}
              </button>
              <button
                type="button"
                className={paneTab}
                data-active={activeTab === "windows" ? "true" : undefined}
                onClick={() => selectTab("windows")}
              >
                <span className={paneTabLabel}>Categories</span>
                {windowChangeCount > 0 && (
                  <span className={tabChangeCount}>{windowChangeCount}</span>
                )}
              </button>
              <button
                type="button"
                className={paneTab}
                data-active={activeTab === "queues" ? "true" : undefined}
                onClick={() => selectTab("queues")}
              >
                <span className={paneTabLabel}>Queues</span>
                {precedenceChangeCount > 0 && (
                  <span className={tabChangeCount}>
                    {precedenceChangeCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={paneTab}
                data-active={activeTab === "habits" ? "true" : undefined}
                onClick={() => selectTab("habits")}
              >
                <span className={paneTabLabel}>Habits</span>
                {habitChangeCount > 0 && (
                  <span className={tabChangeCount}>{habitChangeCount}</span>
                )}
              </button>
            </div>
            <div className={paneSubheaderSection}>
              <span className={paneSubtitle}>
                {hasChanges ? "unsaved changes" : "current state"}
              </span>
              {activeTab === "goals" &&
                (hiddenCount > 0 ? (
                  <span className={headerActionCluster}>
                    <button
                      type="button"
                      className={headerActionButton}
                      onClick={() => setShowAll(true)}
                    >
                      Show all · {hiddenCount} more goal
                      {hiddenCount === 1 ? "" : "s"}
                    </button>
                  </span>
                ) : showAll && visibleGoals.length > 0 ? (
                  <span className={headerActionCluster}>
                    <button
                      type="button"
                      className={headerActionButton}
                      onClick={() => setShowAll(false)}
                    >
                      Show relevant only
                    </button>
                  </span>
                ) : null)}
            </div>
          </div>
          {activeTab === "goals" ? (
            <JsonForestView
              goals={visibleGoals}
              hiddenCount={hiddenCount}
              categories={categories}
              focusRootId={focusRootId}
              groupByCategory={showAll}
            />
          ) : activeTab === "week" ? (
            <TemplateWeekView
              templates={diffedTemplates}
              locations={locations}
            />
          ) : activeTab === "windows" ? (
            <WindowsView diffed={diffedWindows} />
          ) : activeTab === "queues" ? (
            <PrecedenceView
              diffed={diffedPrecedence}
              titleById={precedenceTitleById}
              categoryNameById={categoryNameById}
            />
          ) : (
            <HabitsView diff={diffedHabits} titleById={precedenceTitleById} />
          )}
        </div>
      </div>

      {!embedded && (
        <ConfirmModal
          open={discardIntent !== null}
          title="Discard changes?"
          body={
            <p style={{ margin: 0 }}>
              The assistant has proposed changes to your{" "}
              {formatDirtyDomains(
                hasForestChanges,
                hasTemplateChanges,
                hasWindowChanges,
                hasPrecedenceChanges,
                hasHabitChanges,
              )}
              .{" "}
              {discardIntent?.kind === "new"
                ? "Starting a new chat will discard them."
                : discardIntent?.kind === "adopt"
                  ? "Loading another conversation will discard them."
                  : "Closing now will discard them."}
            </p>
          }
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          tone="danger"
          onCancel={() => setDiscardIntent(null)}
          onConfirm={() => {
            const intent = discardIntent;
            setDiscardIntent(null);
            if (!intent) return;
            if (intent.kind === "new") startNewConversation();
            else if (intent.kind === "adopt") adoptConversation(intent.payload);
            else onClose();
          }}
        />
      )}
    </>
  );

  // BYOK gate: when the user opted out, or opted in but this device holds no
  // key, every entry point lands here instead of the chat UI. The shell
  // chrome (backdrop, banner) stays so the modal still reads as the
  // assistant surface.
  const gateContent = (
    <>
      <Grain />
      {!embedded && (
        <div className={banner}>
          <span className={editingLabel}>ai assistant</span>
          <span className={bannerSpacer} />
          <Button
            variant="ghost"
            size="sm"
            onClick={requestClose}
            className={cancelButtonStyle}
          >
            Close
          </Button>
        </div>
      )}
      <AssistantGate />
    </>
  );
  const activeContent = aiStatus === "ready" ? content : gateContent;

  if (embedded) {
    return <div className={embeddedRoot}>{activeContent}</div>;
  }

  return (
    <Dialog.Root
      open={open}
      // Non-modal so the Capture/Search palettes keep working above it; the
      // full-screen cover blocks everything else. Dismissal is Esc / Close.
      modal={false}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <Dialog.Overlay className={overlay} />
      <Dialog.Content
        className={modal}
        aria-describedby={undefined}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Dialog.Title className={a11yHiddenTitle}>AI Assistant</Dialog.Title>
        {activeContent}
      </Dialog.Content>
    </Dialog.Root>
  );
}
