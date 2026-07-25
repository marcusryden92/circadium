"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import { CornerDownLeft, Plus, Sparkles } from "lucide-react";
import {
  Button,
  Caption,
  ConfirmModal,
  DateTimePicker,
  Input,
  Kbd,
  Loader,
  PageHeader,
  vars,
} from "@/components/ui";
import { GoalPickerList } from "@/components/GoalPickerList";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useSelector } from "react-redux";
import { listRow } from "@/lib/theme";
import { usePlatform } from "@/hooks/usePlatform";
import { deleteGoal } from "@/utils/goalPageHandlers";
import { demoteRootIntoGoal } from "@/utils/goal-handlers/demoteRootIntoGoal";
import { PRIORITY_DEFAULT } from "@/utils/plannerPriority";
import { isUnprocessed } from "@/utils/plannerStatus";
import { ageLabel } from "@/utils/timeFormatting";
import type { RootState } from "@/redux/store";
import type { Planner, Category } from "@/types/prisma";
import { CategoryPicker } from "./_components/CategoryPicker";
import { useCaptureKeyboard } from "./_hooks/useCaptureKeyboard";
import {
  DEFAULT_DRAFT_DURATION_MIN,
  TYPE_OPTIONS,
  type TriageType,
} from "./_constants";
import {
  page,
  spacer,
  mainGrid,
  queueRail,
  queueHead,
  queueTitle,
  quickAdd,
  quickAddInput,
  queueList,
  queueRow,
  queueRowActive,
  queueRowTitle,
  queueRowAge,
  queueEmpty,
  main,
  breadcrumb,
  card,
  itemTitle,
  typeGrid,
  typeCard,
  typeCardActive,
  typeCardDanger,
  typeCardFocused,
  typeCardLabel,
  typeCardSub,
  typeCardKbd,
  fieldGrid,
  field,
  fieldLabel,
  fieldInput,
  actionRow,
  errorText,
  nestModalBody,
  nestNote,
  footerHint,
  emptyMain,
  emptyMainTitle,
} from "./page.css";

export default function CapturePage() {
  const router = useRouter();
  const {
    userId,
    planner,
    categories,
    queues,
    dependencies,
    updatePlannerArray,
    updateAll,
    weekStartDay,
  } = useCalendarProvider();
  const isLoaded = useSelector(
    (state: RootState) => state.calendarSource.isLoaded,
  );
  const { modKey } = usePlatform();

  const queue = useMemo(
    () =>
      planner
        .filter(isUnprocessed)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [planner],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jot, setJot] = useState("");
  const [typeCursor, setTypeCursor] = useState(0);
  const typeKeys = useMemo(() => TYPE_OPTIONS.map((o) => o.key), []);

  // Pin selection to the first queue item when nothing is selected, or when
  // the previous selection drops out (saved / trashed). Stays put across
  // re-renders while still on a valid item.
  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !queue.find((q) => q.id === selectedId)) {
      setSelectedId(queue[0].id);
    }
  }, [queue, selectedId]);

  const selected = useMemo(
    () =>
      selectedId ? (queue.find((q) => q.id === selectedId) ?? null) : null,
    [queue, selectedId],
  );

  // Draft state — local edits before commit, bundled as one object so the
  // five fields move together. Reset whenever the selected item changes so
  // the right side never shows stale form values.
  type Draft = {
    type: TriageType;
    duration: number;
    deadline: string;
    starts: string;
    categoryId: string;
  };
  const [draft, setDraft] = useState<Draft>({
    type: "task",
    duration: DEFAULT_DRAFT_DURATION_MIN,
    deadline: "",
    starts: "",
    categoryId: "",
  });

  // "File under existing goal" modal — a secondary path off the triage card.
  // Kept out of the draft so the fast task/plan/goal flow is untouched.
  const [nestOpen, setNestOpen] = useState(false);
  const [nestTargetId, setNestTargetId] = useState<string | null>(null);
  const [nestError, setNestError] = useState<string | null>(null);

  const closeNest = useCallback(() => {
    setNestOpen(false);
    setNestTargetId(null);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setNestError(null);
    closeNest();
    setDraft({
      type:
        selected.plannerType === "plan"
          ? "plan"
          : selected.plannerType === "goal"
            ? "goal"
            : "task",
      duration:
        selected.duration > 0 ? selected.duration : DEFAULT_DRAFT_DURATION_MIN,
      deadline: selected.deadline ? selected.deadline.slice(0, 10) : "",
      starts: selected.starts ? selected.starts.slice(0, 16) : "",
      categoryId: selected.categoryId ?? "",
    });
  }, [selected, closeNest]);

  // Triaged top-level goals the current item can be nested under.
  const targetGoals = useMemo(
    () =>
      planner
        .filter(
          (p) =>
            p.parentId == null &&
            p.isTriaged &&
            p.plannerType === "goal" &&
            p.id !== selectedId,
        )
        .sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [planner, selectedId],
  );

  useEffect(() => {
    const idx = typeKeys.indexOf(draft.type);
    if (idx !== -1) setTypeCursor(idx);
  }, [draft.type, typeKeys]);

  const advanceAfterSelectedId = useCallback(
    (id: string) => {
      const idx = queue.findIndex((q) => q.id === id);
      const next = queue[idx + 1] ?? queue[idx - 1] ?? null;
      setSelectedId(next ? next.id : null);
    },
    [queue],
  );

  const handleQuickAdd = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      const t = jot.trim();
      if (!t) return;
      const now = new Date().toISOString();
      const newItem: Planner = {
        id: uuidv4(),
        title: t,
        parentId: null,
        plannerType: "task",
        // Ready by default; the untriaged flag, not readiness, keeps it a draft.
        isReady: true,
        isTriaged: false,
        duration: 0,
        deadline: null,
        starts: null,
        recurrence: null,
        recurrenceExceptions: null,
        splitting: null,
        completedSegments: null,
        maxMinutesPerDay: null,
        earliestStartDate: null,
        allowedTimes: null,
        linkedItemId: null,
        notes: null,
        sortOrder: 0,
        completedStartTime: null,
        completedEndTime: null,
        priority: PRIORITY_DEFAULT,
        userId,
        color: null,
        locationId: null,
        useParentLocation: false,
        categoryId: null,
        createdAt: now,
        updatedAt: now,
      };
      updatePlannerArray((prev: Planner[]) => [...prev, newItem]);
      setJot("");
    },
    [jot, userId, updatePlannerArray],
  );

  // Stamp the draft's triage fields onto a row. isReady is passed in because
  // the nest path lets the demote below override it with the goal's readiness;
  // typeOverride lets that path force "goal" regardless of the picked type.
  const applyTriage = useCallback(
    (p: Planner, isReady: boolean, typeOverride?: TriageType): Planner => {
      const type = typeOverride ?? draft.type;
      const isGoal = type === "goal";
      return {
        ...p,
        plannerType: type,
        duration: isGoal ? 0 : Math.max(1, draft.duration),
        deadline: draft.deadline
          ? new Date(draft.deadline).toISOString()
          : null,
        starts:
          type === "plan" && draft.starts
            ? new Date(draft.starts).toISOString()
            : null,
        categoryId: draft.categoryId || null,
        isReady,
        isTriaged: true,
        updatedAt: new Date().toISOString(),
      };
    },
    [draft],
  );

  const commitSelected = useCallback(
    (markReady: boolean) => {
      if (!selected) return;
      const id = selected.id;
      // A goal can never be readied here (it needs subtasks, enforced on the
      // item detail). Tasks and plans are freely readyable — readiness is just
      // the scheduling gate, so "Save as draft" leaves a triaged item unready
      // rather than encoding draftness.
      const nextReady = draft.type === "goal" ? false : markReady;
      updatePlannerArray((prev: Planner[]) =>
        prev.map((p) => (p.id === id ? applyTriage(p, nextReady) : p)),
      );
      advanceAfterSelectedId(id);
    },
    [
      selected,
      draft.type,
      applyTriage,
      updatePlannerArray,
      advanceAfterSelectedId,
    ],
  );

  // File-under-goal path: turn the item into a goal (regardless of the type
  // picked in the regular view) and triage it — stamping isTriaged so the
  // demote helper, which never sets it, doesn't leave a scheduling-filtered
  // orphan — then demote it under the chosen goal, which overrides categoryId
  // and readiness with the goal's, exactly what filing under it means.
  const commitNest = useCallback(() => {
    if (!selected || !nestTargetId) return;
    const id = selected.id;
    const triaged = planner.map((p) =>
      p.id === id ? applyTriage(p, p.isReady === true, "goal") : p,
    );
    const result = demoteRootIntoGoal(
      triaged,
      id,
      nestTargetId,
      queues,
      dependencies,
    );
    if (!Array.isArray(result)) {
      setNestError(result.error);
      return;
    }
    setNestError(null);
    updatePlannerArray(result);
    closeNest();
    advanceAfterSelectedId(id);
  }, [
    selected,
    nestTargetId,
    planner,
    queues,
    dependencies,
    applyTriage,
    updatePlannerArray,
    closeNest,
    advanceAfterSelectedId,
  ]);

  const skipSelected = useCallback(() => {
    if (!selected) return;
    advanceAfterSelectedId(selected.id);
  }, [selected, advanceAfterSelectedId]);

  const trashSelected = useCallback(() => {
    if (!selected) return;
    const id = selected.id;
    deleteGoal({ updateAll, taskId: id });
    advanceAfterSelectedId(id);
  }, [selected, updateAll, advanceAfterSelectedId]);

  const setDraftType = useCallback(
    (type: TriageType) => setDraft((d) => ({ ...d, type })),
    [],
  );

  useCaptureKeyboard({
    // The nest modal traps focus and owns Enter/Escape; pausing the global
    // triage keys keeps them from leaking to the card underneath.
    paused: nestOpen,
    selected,
    queue,
    setSelectedId,
    setDraftType,
    commitSelected,
    trashSelected,
    typeCursor,
    setTypeCursor,
    typeKeys,
  });

  const selectedCategory: Category | null = useMemo(() => {
    if (!draft.categoryId) return null;
    return categories.find((c) => c.id === draft.categoryId) ?? null;
  }, [categories, draft.categoryId]);

  const nestTargetTitle = nestTargetId
    ? targetGoals.find((g) => g.id === nestTargetId)?.title || "Untitled"
    : null;

  return (
    <div className={page}>
      <PageHeader
        title="Capture"
        summary={
          queue.length === 0
            ? "Inbox empty"
            : `${queue.length} to triage · raw notes → schedulable items`
        }
      >
        <span className={spacer} />
        <Kbd keys={[modKey, "K"]} instruction="capture" />
      </PageHeader>

      <div className={mainGrid}>
        <aside className={queueRail}>
          <div className={queueHead}>
            <span className={queueTitle}>Queue</span>
            <Caption>oldest first</Caption>
          </div>

          <div className={quickAdd}>
            <Plus size={14} strokeWidth={2.4} style={{ color: vars.muted }} />
            <Input
              variant="bare"
              className={quickAddInput}
              placeholder="jot anything…"
              value={jot}
              onChange={(e) => setJot(e.target.value)}
              onKeyDown={handleQuickAdd}
            />
            <Kbd keys={<CornerDownLeft size={11} strokeWidth={2.4} />} />
          </div>

          <div className={queueList}>
            {!isLoaded ? (
              <div
                className={queueEmpty}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Loader size="md" label="Loading queue" />
              </div>
            ) : queue.length === 0 ? (
              <div className={queueEmpty}>
                <Sparkles
                  size={20}
                  strokeWidth={2}
                  style={{ margin: "0 auto 6px", opacity: 0.5 }}
                />
                Inbox zero.
                <br />
                Jot something to get started.
              </div>
            ) : (
              queue.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${listRow({ selected: active })} ${queueRow} ${active ? queueRowActive : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className={queueRowTitle}>{item.title}</span>
                    <span className={queueRowAge}>
                      {ageLabel(item.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={main}>
          {!isLoaded ? (
            <div className={emptyMain}>
              <Loader size="md" label="Loading triage" />
            </div>
          ) : !selected ? (
            <div className={emptyMain}>
              <Sparkles size={24} strokeWidth={2} style={{ opacity: 0.5 }} />
              <div className={emptyMainTitle}>Nothing to triage</div>
              <div>
                Every captured note has a type, duration, and deadline. Jot
                something on the left, or open Library to keep working.
              </div>
            </div>
          ) : (
            <>
              <div className={breadcrumb}>
                <span>
                  {Math.max(
                    0,
                    queue.findIndex((q) => q.id === selected.id),
                  ) + 1}{" "}
                  of {queue.length}
                </span>
                <span>·</span>
                <span>
                  captured{" "}
                  {formatDistanceToNowStrict(new Date(selected.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>

              <div className={card}>
                <h2 className={itemTitle}>{selected.title}</h2>

                <div className={typeGrid}>
                  {TYPE_OPTIONS.map((opt, idx) => {
                    const active = draft.type === opt.key;
                    const focused = typeCursor === idx;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`${typeCard} ${active ? typeCardActive : ""} ${focused ? typeCardFocused : ""}`}
                        onClick={() => {
                          setDraftType(opt.key);
                          setTypeCursor(idx);
                        }}
                      >
                        <span className={typeCardLabel}>{opt.label}</span>
                        <span className={typeCardSub}>{opt.sub}</span>
                        <span className={typeCardKbd}>key · {opt.hint}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`${typeCard} ${typeCardDanger} ${typeCursor === TYPE_OPTIONS.length ? typeCardFocused : ""}`}
                    onClick={trashSelected}
                    title="Delete this item"
                  >
                    <span className={typeCardLabel}>trash</span>
                    <span className={typeCardSub}>not worth doing</span>
                    <span className={typeCardKbd}>key · x</span>
                  </button>
                </div>

                <div className={fieldGrid}>
                  <div className={field}>
                    <span className={fieldLabel}>duration</span>
                    {draft.type === "goal" ? (
                      <span className={fieldInput} style={{ opacity: 0.4 }}>
                        —
                      </span>
                    ) : (
                      <Input
                        variant="bare"
                        className={fieldInput}
                        type="number"
                        min={1}
                        value={draft.duration}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            duration: Number(e.target.value) || 0,
                          }))
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    )}
                  </div>

                  {draft.type === "plan" ? (
                    <div className={field}>
                      <span className={fieldLabel}>scheduled</span>
                      <DateTimePicker
                        variant="bare"
                        value={draft.starts}
                        onChange={(starts) =>
                          setDraft((d) => ({ ...d, starts }))
                        }
                        weekStartsOn={weekStartDay}
                        ariaLabel="Scheduled time"
                      />
                    </div>
                  ) : (
                    <div className={field}>
                      <span className={fieldLabel}>deadline</span>
                      <DateTimePicker
                        mode="date"
                        variant="bare"
                        value={draft.deadline}
                        onChange={(deadline) =>
                          setDraft((d) => ({ ...d, deadline }))
                        }
                        weekStartsOn={weekStartDay}
                        ariaLabel="Deadline"
                      />
                    </div>
                  )}

                  <div className={field}>
                    <span className={fieldLabel}>category</span>
                    <CategoryPicker
                      categories={categories}
                      value={draft.categoryId}
                      onChange={(categoryId) =>
                        setDraft((d) => ({ ...d, categoryId }))
                      }
                      selected={selectedCategory}
                    />
                  </div>
                </div>

                <div className={actionRow}>
                  <Button variant="glass" size="sm" onClick={skipSelected}>
                    Skip
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => commitSelected(false)}
                  >
                    Save, not ready
                  </Button>
                  <span className={spacer} />
                  {targetGoals.length > 0 && (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => setNestOpen(true)}
                    >
                      File under existing goal
                    </Button>
                  )}
                  <Button
                    variant="solid"
                    size="sm"
                    onClick={() => commitSelected(true)}
                  >
                    {draft.type === "goal" ? "Save" : "Save & mark ready"}
                  </Button>
                </div>

                {nestError && <div className={errorText}>{nestError}</div>}
              </div>

              <div className={footerHint}>
                <Kbd
                  keys={<CornerDownLeft size={11} strokeWidth={2.4} />}
                  instruction="save & next"
                />
                <Kbd keys={["1", "2", "3"]} separator="/" instruction="type" />
                <Kbd
                  keys={["←", "→"]}
                  separator="/"
                  instruction="cycle buttons"
                />
                <Kbd keys="x" instruction="trash" />
                <span className={spacer} />
                <span
                  role="button"
                  onClick={() => router.push("/library")}
                  style={{ cursor: "pointer", textDecoration: "underline" }}
                >
                  Open Library
                </span>
              </div>

              <ConfirmModal
                open={nestOpen}
                title="File under existing goal"
                body={
                  <div className={nestModalBody}>
                    <GoalPickerList
                      goals={targetGoals}
                      onSelect={setNestTargetId}
                      onSubmit={commitNest}
                    />
                    <div className={nestNote}>
                      {nestTargetTitle ? (
                        <>
                          Confirming turns{" "}
                          <strong>{selected.title || "this item"}</strong> into
                          a goal filed under{" "}
                          <strong>{nestTargetTitle}</strong>. It leaves the
                          triage queue; add subtasks to schedule its work.
                        </>
                      ) : (
                        <>
                          Select a goal to file{" "}
                          <strong>{selected.title || "this item"}</strong>{" "}
                          under. Whatever type it is now, it becomes a goal
                          nested inside the one you pick.
                        </>
                      )}
                    </div>
                  </div>
                }
                confirmLabel="File under goal"
                cancelLabel="Cancel"
                confirmDisabled={!nestTargetId}
                onCancel={closeNest}
                onConfirm={commitNest}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
