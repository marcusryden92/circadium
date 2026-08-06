"use client";

import { space, vars } from "@/lib/theme";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  X,
  Trash2,
  Copy,
  MapPin,
  Link2,
  Link2Off,
  ArrowUpFromLine,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import {
  Button,
  Caption,
  FieldStack,
  Input,
  ProgressBar,
  Switch,
  type ComboboxOption,
} from "@/components/ui";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import { canLinkAsDetour } from "@/utils/precedence/detourLinks";
import { isValidPrecedenceEndpoint } from "@/utils/precedence/endpoints";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import {
  SplittingFields,
  DEFAULT_SPLITTING_SETTINGS,
} from "@/components/tasks/SplittingFields";
import {
  parseTaskSplitting,
  serializeTaskSplitting,
  setSplitCompletedMinutes,
  splitCompletedMinutes,
  type TaskSplittingSettings,
} from "@/utils/taskSplitting";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import { useFlashBoolean } from "@/hooks/useFlashAnimation";
import { assignLocationToPlanner } from "@/actions/locations";
import { deleteGoal, duplicateSubtree } from "@/utils/goalPageHandlers";
import { getEffectiveCategoryId } from "@/utils/goalPageHandlers";
import { promoteSubtree } from "@/utils/goal-handlers/promoteSubtree";
import { NEW_SUBTASK_TITLE } from "@/components/tasks/task-item-subcomponents/TaskHeader";
import {
  setSubtaskCompletedAt,
  toggleSubtaskCompletion,
} from "@/utils/goal-handlers/subtaskCompletion";
import { getRootParentId, getSubtasksById } from "@/utils/goalPageHandlers";
import { Check } from "lucide-react";
import {
  Combobox,
  ConfirmModal,
  DateTimePicker,
  DurationField,
} from "@/components/ui";
import { formatDatetimeLocal, parseDatetimeLocal } from "@/utils/datetime";
import { historyMessages } from "@/utils/historyMessages";
import { SHAKE_DURATION_MS } from "../../../_constants";

import {
  drawer,
  drawerHeader,
  drawerHeaderLabel,
  drawerClose,
  drawerBody,
  drawerTitleInput,
  drawerSection,
  sectionHead,
  sectionHeadLabel,
  sectionHeadRule,
  fieldLabel,
  splitToggleRow,
  splitHint,
  dateInputFaded,
  notesInput,
  completeSection,
  completeHeader,
  completeCheckbox,
  splitCompletedRow,
  splitCompletedNote,
  drawerFooter,
  footerActionGroup,
} from "./EditDrawer.css";

export function EditDrawer() {
  const {
    planner,
    categories,
    queues,
    dependencies,
    updatePlannerArray,
    updateAll,
    weekStartDay,
  } = useCalendarProvider();
  const router = useRouter();
  const { focusedTask, setFocusedTask } = useDraggableContext();
  const locations = useSelector(
    (state: RootState) => state.schedulingSettings.locations,
  );

  const task = useMemo(
    () => (focusedTask ? planner.find((p) => p.id === focusedTask) : undefined),
    [planner, focusedTask],
  );

  const isLeaf = useMemo(
    () => (task ? getSubtasksById(planner, task.id).length === 0 : false),
    [planner, task],
  );

  // Gate completion on the root item being ready (mirrors TaskItem.tsx).
  const completionLocked = useMemo(() => {
    if (!task) return false;
    const rootId = getRootParentId(planner, task.id);
    if (!rootId) return false;
    const root = planner.find((p) => p.id === rootId);
    return root ? !root.isReady : false;
  }, [planner, task]);

  // A recurring goal completes per period, not per row — its leaves are checked
  // off in the "Manage completion" modal, so hide the row-level completion
  // controls here (they would write inert row columns the engine ignores).
  const rootIsRecurring = useMemo(() => {
    if (!task) return false;
    const rootId = getRootParentId(planner, task.id);
    const root = rootId ? planner.find((p) => p.id === rootId) : undefined;
    return root ? plannerHasFlexibleRecurrence(root) : false;
  }, [planner, task]);

  // Linkable detour targets: triaged root goals/tasks, excluding this item's
  // own root and completed items. Cycle-forming targets stay listed but
  // annotated and blocked at commit (the Combobox has no per-option disable).
  const linkTargets = useMemo(() => {
    if (!task) {
      return {
        options: [] as ComboboxOption<string | null>[],
        blocked: new Set<string>(),
      };
    }
    const ownRoot = getRootParentId(planner, task.id);
    const blocked = new Set<string>();
    const options: ComboboxOption<string | null>[] = planner
      .filter(
        (p) =>
          isValidPrecedenceEndpoint(p) &&
          p.id !== ownRoot &&
          !plannerIsCompleted(p),
      )
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      .map((t) => {
        const ok = canLinkAsDetour(
          planner,
          task.id,
          t.id,
          queues,
          dependencies,
        ).ok;
        if (!ok) blocked.add(t.id);
        return {
          value: t.id,
          label: ok
            ? t.title || "Untitled"
            : `${t.title || "Untitled"} — would create a loop`,
          searchLabel: t.title ?? undefined,
        };
      });
    return { options, blocked };
  }, [planner, task, queues, dependencies]);

  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(task?.title ?? "");
  }, [task?.id, task?.title]);

  useEffect(() => {
    setNotesDraft(null);
  }, [task?.id]);

  // Escape closes the drawer. defaultPrevented check yields to any open Radix
  // Dialog above (the delete confirm) — Radix's dismissable-layer calls
  // preventDefault on Escape when it consumes it.
  useEffect(() => {
    if (!task) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") setFocusedTask(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, setFocusedTask]);

  // Auto-focus + select the title input for freshly created subtasks.
  useEffect(() => {
    if (task?.title === NEW_SUBTASK_TITLE && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [task?.id, task?.title]);

  const [shakeLocked, flashShake] = useFlashBoolean(SHAKE_DURATION_MS);

  if (!task) return null;

  const close = () => setFocusedTask(null);

  const splitSettings = parseTaskSplitting(task.splitting);
  const splitCompleted = splitCompletedMinutes(task);

  const effectiveCategory = categories.find(
    (c) => c.id === getEffectiveCategoryId(planner, task.id),
  );
  const progressColor = effectiveCategory?.color ?? vars.accent.primary;

  const isLinked = !!task.linkedItemId;
  const linkedTarget = isLinked
    ? planner.find((p) => p.id === task.linkedItemId)
    : undefined;

  const setLinkedItem = (targetId: string | null) => {
    if (targetId && linkTargets.blocked.has(targetId)) return;
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? {
                ...p,
                linkedItemId: targetId,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      targetId
        ? historyMessages.item.link(
            task.title,
            planner.find((p) => p.id === targetId)?.title ?? "item",
          )
        : historyMessages.item.unlink(task.title),
    );
  };

  const commitTitle = () => {
    const t = titleDraft.trim();
    if (!t || t === task.title) return;
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? { ...p, title: t, updatedAt: new Date().toISOString() }
            : p,
        ),
      historyMessages.item.rename(t),
    );
  };

  const commitNotes = () => {
    if (notesDraft === null) return;
    const next = notesDraft.trim() ? notesDraft : null;
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? { ...p, notes: next, updatedAt: new Date().toISOString() }
            : p,
        ),
      historyMessages.item.field("notes", task.title),
    );
    setNotesDraft(null);
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      setTitleDraft(task.title);
      e.currentTarget.blur();
    }
  };

  const setDuration = (next: number) => {
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? { ...p, duration: next, updatedAt: new Date().toISOString() }
            : p,
        ),
      historyMessages.item.duration(task.title, next),
    );
  };

  const applySplitting = (next: TaskSplittingSettings | null) => {
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? {
                ...p,
                splitting: next ? serializeTaskSplitting(next) : null,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      historyMessages.item.field("splitting", task.title),
    );
  };

  const commitSplitCompleted = (minutes: number) => {
    const now = new Date();
    updatePlannerArray(
      (prev) =>
        prev.map((p) => {
          if (p.id !== task.id) return p;
          const nextSegments = setSplitCompletedMinutes(p, minutes, now);
          if (nextSegments === (p.completedSegments ?? null)) return p;
          return {
            ...p,
            completedSegments: nextSegments,
            updatedAt: now.toISOString(),
          };
        }),
      historyMessages.item.field("completed minutes", task.title),
    );
  };

  const setDeadline = (iso: string | null) => {
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? {
                ...p,
                deadline: iso,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      historyMessages.item.field("deadline", task.title),
    );
  };

  const onDateInput = (value: string) =>
    setDeadline(parseDatetimeLocal(value) || null);

  const onEarliestStartInput = (value: string) => {
    const iso = parseDatetimeLocal(value) || null;
    updatePlannerArray(
      (prev) =>
        prev.map((p) =>
          p.id === task.id
            ? {
                ...p,
                earliestStartDate: iso,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      historyMessages.item.field("earliest start", task.title),
    );
  };

  const onLocationChange = async (locationId: string | null) => {
    await assignLocationToPlanner(task.id, locationId);
    updatePlannerArray(
      (prev) => prev.map((p) => (p.id === task.id ? { ...p, locationId } : p)),
      historyMessages.item.field("location", task.title),
    );
  };

  const dateValue = formatDatetimeLocal(task.deadline);
  const completedValue = formatDatetimeLocal(task.completedEndTime);

  const onCompletedAtChange = (value: string) => {
    if (completionLocked) {
      flashShake();
      return;
    }
    const iso = parseDatetimeLocal(value) || null;
    updatePlannerArray(
      (prev) => setSubtaskCompletedAt(prev, task.id, iso),
      historyMessages.item.field("completion time", task.title),
    );
  };

  const toggleCompletion = () => {
    if (completionLocked) {
      flashShake();
      return;
    }
    updatePlannerArray(
      (prev) => toggleSubtaskCompletion(prev, task.id),
      task.completedEndTime
        ? historyMessages.item.uncomplete(task.title)
        : historyMessages.item.complete(task.title),
    );
  };

  const isCompleted = !!task.completedEndTime;

  const locationOptions = [
    { value: null, label: <Caption>Anywhere</Caption> },
    ...locations.map((l) => ({
      value: l.id,
      label: (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: space["2"],
          }}
        >
          <MapPin size={12} strokeWidth={2} />
          <span>{l.name}</span>
        </span>
      ),
    })),
  ];

  const currentLocation = locations.find((l) => l.id === task.locationId);

  const handleDelete = () => {
    deleteGoal({ updateAll, taskId: task.id, title: task.title });
    setShowDeleteConfirm(false);
    setFocusedTask(null);
  };

  const handleDuplicate = () => {
    const result = duplicateSubtree({ planner, taskId: task.id });
    if (!result) return;
    updatePlannerArray(
      result.newPlanner,
      historyMessages.item.duplicate(task.title),
    );
    setFocusedTask(result.newRootId);
  };

  const promotedCategoryName = effectiveCategory?.name ?? null;

  const handlePromote = () => {
    const result = promoteSubtree(planner, task.id);
    setShowPromoteConfirm(false);
    if (!Array.isArray(result)) return;
    updatePlannerArray(result, historyMessages.item.promote(task.title));
    setFocusedTask(null);
    router.push(`/items/${task.id}`);
  };

  return (
    <aside className={drawer}>
      <div className={drawerHeader}>
        <span className={drawerHeaderLabel}>Edit subtask</span>
        <button
          type="button"
          className={drawerClose}
          onClick={close}
          aria-label="Close"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>

      <div className={drawerBody}>
        <Input
          ref={titleInputRef}
          variant="titleInline"
          className={drawerTitleInput}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={onTitleKey}
          placeholder="Subtask title"
        />

        {isLinked ? (
          <div className={drawerSection}>
            <div className={sectionHead}>
              <span className={sectionHeadLabel}>Connections</span>
              <span className={sectionHeadRule} aria-hidden />
            </div>
            <FieldStack size="sm" label="Linked item">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: space["2"],
              }}
            >
              <Link2
                size={13}
                strokeWidth={2}
                style={{ color: vars.swatches.violet }}
              />
              <span style={{ flex: 1, fontWeight: 500 }}>
                {linkedTarget?.title || "Untitled"}
              </span>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setLinkedItem(null)}
                aria-label="Unlink"
                title="Unlink"
              >
                <Link2Off size={12} strokeWidth={2.2} />
              </Button>
            </div>
            <Caption>
              This subtask redirects the schedule into the linked item; its own
              duration and subtasks are ignored.
            </Caption>
            {linkedTarget && !linkedTarget.isReady && (
              <Caption style={{ color: vars.status.warning }}>
                The linked item is not marked ready — its work is silently
                skipped until it is.
              </Caption>
            )}
            </FieldStack>
          </div>
        ) : (
          <>
            {isLeaf && !rootIsRecurring && splitSettings && (
              <div className={completeSection}>
                <span className={fieldLabel}>Completed</span>
                <div className={splitCompletedRow}>
                  {completionLocked ? (
                    <span
                      className={splitCompletedNote}
                      title="Mark the goal ready before completing subtasks"
                    >
                      {formatMinutesToHours(splitCompleted)}
                    </span>
                  ) : (
                    <DurationField
                      minutes={splitCompleted}
                      onCommit={commitSplitCompleted}
                      ariaLabel="Completed time"
                    />
                  )}
                  <span className={splitCompletedNote}>
                    of {formatMinutesToHours(task.duration ?? 0)} done
                  </span>
                </div>
                <ProgressBar
                  value={splitCompleted}
                  max={Math.max(task.duration ?? 0, 1)}
                  color={progressColor}
                  size="sm"
                />
              </div>
            )}

            {isLeaf && !rootIsRecurring && !splitSettings && (
              <div className={completeSection}>
                <div className={completeHeader}>
                  <button
                    type="button"
                    className={completeCheckbox}
                    data-completed={isCompleted ? "true" : "false"}
                    data-locked={completionLocked ? "true" : "false"}
                    data-shake={shakeLocked ? "true" : "false"}
                    onClick={toggleCompletion}
                    aria-pressed={isCompleted}
                    aria-label={
                      isCompleted ? "Mark incomplete" : "Mark complete"
                    }
                    title={
                      completionLocked
                        ? "Mark the goal ready before completing subtasks"
                        : undefined
                    }
                  >
                    {isCompleted && <Check size={12} strokeWidth={3} />}
                  </button>
                  <span className={fieldLabel}>Completed at</span>
                </div>
                <div
                  className={
                    isCompleted && !completionLocked ? "" : dateInputFaded
                  }
                  title={
                    completionLocked
                      ? "Mark the goal ready before completing subtasks"
                      : undefined
                  }
                >
                  <DateTimePicker
                    value={completedValue}
                    onChange={onCompletedAtChange}
                    weekStartsOn={weekStartDay}
                    clearable={isCompleted && !completionLocked}
                    ariaLabel="Completed at"
                  />
                </div>
              </div>
            )}

            <div className={drawerSection}>
              <div className={sectionHead}>
                <span className={sectionHeadLabel}>Scheduling</span>
                <span className={sectionHeadRule} aria-hidden />
              </div>

              <FieldStack size="sm" label="Duration">
                <DurationField
                  minutes={task.duration ?? 0}
                  ariaLabel="Duration"
                  onCommit={setDuration}
                />
              </FieldStack>

              {isLeaf && task.plannerType !== "plan" && (
                <FieldStack size="sm" label="Split into chunks">
                  <div className={splitToggleRow}>
                    <Switch
                      checked={splitSettings !== null}
                      onCheckedChange={(checked) =>
                        applySplitting(
                          checked ? DEFAULT_SPLITTING_SETTINGS : null,
                        )
                      }
                      aria-label="Split into chunks"
                    />
                    {!splitSettings && (
                      <span className={splitHint}>
                        Schedule as flexible chunks instead of one block
                      </span>
                    )}
                  </div>
                  {splitSettings && (
                    <SplittingFields
                      settings={splitSettings}
                      duration={task.duration ?? 0}
                      completed={splitCompleted}
                      onChange={applySplitting}
                      showCompleted={false}
                    />
                  )}
                </FieldStack>
              )}

              <FieldStack size="sm" label="Deadline">
                <DateTimePicker
                  value={dateValue}
                  onChange={onDateInput}
                  weekStartsOn={weekStartDay}
                  ariaLabel="Deadline"
                />
              </FieldStack>

              {task.plannerType !== "plan" && (
                <FieldStack size="sm" label="Earliest start">
                  <DateTimePicker
                    value={formatDatetimeLocal(task.earliestStartDate)}
                    onChange={onEarliestStartInput}
                    weekStartsOn={weekStartDay}
                    ariaLabel="Earliest start"
                  />
                </FieldStack>
              )}

              <FieldStack size="sm" label="Location">
                <Combobox
                  value={task.locationId ?? null}
                  options={locationOptions}
                  onChange={onLocationChange}
                  renderValue={() =>
                    currentLocation ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: space["1.5"],
                        }}
                      >
                        <MapPin size={12} strokeWidth={2} />
                        {currentLocation.name}
                      </span>
                    ) : (
                      <Caption>Anywhere</Caption>
                    )
                  }
                  ariaLabel="Location"
                />
              </FieldStack>
            </div>

            {isLeaf && (
              <div className={drawerSection}>
                <div className={sectionHead}>
                  <span className={sectionHeadLabel}>Connections</span>
                  <span className={sectionHeadRule} aria-hidden />
                </div>

                <FieldStack size="sm" label="Link external item">
                  <Combobox
                    value={null}
                    options={linkTargets.options}
                    onChange={setLinkedItem}
                    placeholder="Link a goal or task…"
                    ariaLabel="Link external item"
                  />
                  <Caption>
                    Splice another goal or task&apos;s work into this position
                    in the sequence.
                  </Caption>
                </FieldStack>
              </div>
            )}
          </>
        )}

        <div className={drawerSection}>
          <div className={sectionHead}>
            <span className={sectionHeadLabel}>Notes</span>
            <span className={sectionHeadRule} aria-hidden />
          </div>
          <textarea
            className={notesInput}
            value={notesDraft ?? task.notes ?? ""}
            placeholder="Anything worth keeping with this subtask…"
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={commitNotes}
            rows={3}
            aria-label="Notes"
          />
        </div>
      </div>

      <div className={drawerFooter}>
        <div className={footerActionGroup}>
          <Button
            variant="glass"
            size="sm"
            onClick={handleDuplicate}
            aria-label="Duplicate subtask"
            title="Duplicate subtask"
          >
            <Copy size={12} strokeWidth={2.2} />
          </Button>
          {task.plannerType !== "plan" && (
            <Button
              variant="glass"
              size="sm"
              onClick={() => setShowPromoteConfirm(true)}
              aria-label="Promote to top level"
              title="Promote to top level"
            >
              <ArrowUpFromLine size={12} strokeWidth={2.2} />
            </Button>
          )}
        </div>
        <Button
          variant="glass"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          aria-label="Delete subtask"
          title="Delete subtask"
        >
          <Trash2 size={12} strokeWidth={2.2} />
        </Button>
      </div>

      <ConfirmModal
        open={showPromoteConfirm}
        title="Promote to top level"
        body={
          <>
            <strong>{task.title}</strong> becomes its own top-level{" "}
            {isLeaf ? "task" : "goal"}.
            {promotedCategoryName ? (
              <>
                {" "}
                It adopts the category <strong>
                  {promotedCategoryName}
                </strong>{" "}
                as its own.
              </>
            ) : null}{" "}
            Time constraints and location inherited from its old parents no
            longer apply.
          </>
        }
        confirmLabel="Promote"
        cancelLabel="Cancel"
        onCancel={() => setShowPromoteConfirm(false)}
        onConfirm={handlePromote}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete subtask"
        body={
          <>
            Delete <strong>{task.title}</strong>? Any nested subtasks will also
            be removed.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />
    </aside>
  );
}
