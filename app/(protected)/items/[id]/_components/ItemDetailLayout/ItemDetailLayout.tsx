"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Check, SquarePen } from "lucide-react";
import {
  Button,
  Caption,
  Input,
  Loader,
  usePreviousPathname,
} from "@/components/ui";
import { NAV_ITEMS } from "@/components/ui/shell/nav";
import { space, vars, interactiveTransition } from "@/lib/theme";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { useFlashValue } from "@/hooks/useFlashAnimation";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { DraggableContextProvider } from "@/components/draggable/DraggableContext";
import {
  getEffectiveCategoryId,
  getSubtasksById,
  getTaskTreeIds,
  getTreeBottomLayer,
} from "@/utils/goalPageHandlers";
import {
  dependencyReadyBlockers,
  readyDependents,
} from "@/utils/precedence/readinessBlockers";
import { setGoalIsReady } from "@/utils/goal-handlers/toggleGoalIsReady";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import type { Planner } from "@/types/prisma";
import { DependencyGatePopover, type GateEntry } from "./DependencyGatePopover";
import {
  completedSubtaskDuration,
  totalSubtaskDuration,
} from "@/utils/taskArrayUtils";
import { useItemHandlers } from "../../_hooks/useItemHandlers";
import type { PlannerType } from "@/generated/client";

import { ItemProvider } from "../ItemContext";
import { ItemTabs } from "../ItemTabs";
import { ConfirmModal } from "@/components/ui";
import { READY_MESSAGE_MS } from "../../_constants";
import {
  page,
  scrollArea,
  innerWrap,
  backRow,
  backLink,
  titleBlock,
  title as titleStyle,
  titleEditInput,
  titleClickable,
  editableTitleWrap,
  titleHoverRow,
  renamePencil,
  headActions,
  readyCluster,
  readyHint,
  tabBodyWrap,
  deleteDock,
} from "./ItemDetailLayout.css";
import { DeleteRow } from "../DeleteRow";

export default function ItemDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;

  // Categories come from the provider (Redux) like every other surface — a
  // page-local fetch showed stale data after edits elsewhere and blocked
  // first paint on its own round-trip.
  const {
    planner,
    updatePlannerArray,
    updateAll,
    categories,
    dependencies,
    updateDependencyArray,
    queueCategoryByRootId,
  } = useCalendarProvider();
  const isCalendarLoaded = useSelector(
    (state: RootState) => state.calendarSource.isLoaded,
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  // Back where you came from (calendar, dashboard, search target, ...) when
  // the previous route is a labeled nav surface; Library otherwise — matching
  // the canvas-route back button's tracked-route-over-router.back() rationale.
  const previousPathname = usePreviousPathname();
  const backTarget = useMemo(() => {
    if (previousPathname && !previousPathname.startsWith("/items")) {
      const nav = NAV_ITEMS.find(
        (n) =>
          n.href !== null &&
          (previousPathname === n.href ||
            previousPathname.startsWith(`${n.href}/`)),
      );
      if (nav) return { href: previousPathname, label: nav.label };
    }
    return { href: "/library", label: "Library" };
  }, [previousPathname]);

  const item = useMemo(
    () => planner.find((p) => p.id === itemId),
    [planner, itemId],
  );

  const subtasks = useMemo(() => {
    if (!item || item.plannerType !== "goal") return [];
    return getSubtasksById(planner, item.id);
  }, [planner, item]);

  const totalDuration = useMemo(() => {
    if (!item) return 0;
    if (item.plannerType === "goal") {
      return totalSubtaskDuration(item.id, planner);
    }
    return item.duration;
  }, [item, planner]);

  const completedDuration = useMemo(() => {
    if (!item) return 0;
    if (item.plannerType === "goal") {
      return completedSubtaskDuration(item.id, planner);
    }
    return item.completedEndTime ? item.duration : 0;
  }, [item, planner]);

  // Subitems inherit their category from the nearest ancestor that has one —
  // resolve the effective id, not the row's own (usually null on children).
  // Queue membership contributes the queue's category as an inherited
  // default so the badge matches the engine.
  const category = useMemo(() => {
    if (!item) return null;
    const effectiveId = getEffectiveCategoryId(
      planner,
      item.id,
      queueCategoryByRootId,
    );
    if (!effectiveId) return null;
    return categories.find((c) => c.id === effectiveId) ?? null;
  }, [item, planner, categories, queueCategoryByRootId]);
  const categoryHasLocation = !!category?.locationId;

  const handlers = useItemHandlers(
    item,
    planner,
    updatePlannerArray,
    updateAll,
    categoryHasLocation,
    categories,
  );

  const {
    showDeleteConfirm,
    setShowDeleteConfirm,
    locationOverrideEnabled,
    handleSaveTitle,
    handleToggleReady,
    handleUpdateField,
    handleColorChange,
    handleDateChange,
    handleCategoryChange,
    handleLocationChange,
    handleToggleLocationOverride,
    showResetLocationsConfirm,
    setShowResetLocationsConfirm,
    confirmResetSubgoalLocations,
  } = handlers;

  const handleDelete = () => {
    if (!item) return;
    handlers.handleDelete();
    router.push("/library");
  };

  // "Subtasks" in the item detail view refers to actionable (leaf) descendants —
  // intermediate branches aren't work you check off, so they don't count.
  const leafSubtasks = useMemo(() => {
    if (!item || item.plannerType !== "goal" || subtasks.length === 0)
      return [];
    return getTreeBottomLayer(planner, item.id);
  }, [item, planner, subtasks.length]);
  const totalSubtasks = leafSubtasks.length;
  const completedSubtasks = leafSubtasks.filter(
    (s) => s.completedEndTime,
  ).length;
  const pct =
    totalDuration > 0
      ? Math.round((completedDuration / totalDuration) * 100)
      : 0;

  // Recurring completion history lives in the occurrence log (keyed on the
  // item's tree), and deleting the item cascade-removes it. Surface the count
  // so the delete confirm can warn that history goes with it.
  const completionRows = useSelector(
    (state: RootState) => state.occurrenceCompletions.rows,
  );
  const loggedHistoryCount = useMemo(() => {
    if (!item || !plannerHasFlexibleRecurrence(item)) return 0;
    const treeIds = new Set(getTaskTreeIds(planner, item.id));
    return completionRows.filter((r) => treeIds.has(r.plannerId)).length;
  }, [item, planner, completionRows]);

  // Transient hint shown under the Ready button — only set when the user
  // attempts a blocked toggle. Declared up here so the hook order stays stable
  // across the early returns below.
  const [readyMessage, flashReadyMessage] = useFlashValue<string | null>(
    READY_MESSAGE_MS,
    null,
  );

  if (!isCalendarLoaded) {
    return (
      <div className={page}>
        <div className={scrollArea}>
          <div
            className={innerWrap}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 240,
            }}
          >
            <Loader size="md" label="Loading item" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className={page}>
        <div className={scrollArea}>
          <div className={innerWrap}>
            <button
              type="button"
              className={backLink}
              onClick={() => router.push(backTarget.href)}
            >
              <ArrowLeft size={12} strokeWidth={2.4} />
              {backTarget.label}
            </button>
            <p style={{ marginTop: space["3.5"] }}>
              <Caption>Item not found.</Caption>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const beginEditTitle = () => {
    setDraftTitle(item.title);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    const t = draftTitle.trim();
    if (t && t !== item.title) handleSaveTitle(t);
    setEditingTitle(false);
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitTitle();
    if (e.key === "Escape") setEditingTitle(false);
  };

  const isGoal = item.plannerType === "goal";
  const isTask = item.plannerType === "task";

  // Readiness is the scheduling gate for both goals and standalone tasks, so
  // the toggle appears on either (root items only — readiness is a whole-tree
  // property). A goal has prerequisites before it can be readied; a task has
  // none — it is freely held on or off the calendar.
  const showReadyToggle = !item.parentId && (isGoal || isTask);
  const readyBlockers: string[] = [];
  if (isGoal) {
    if (subtasks.length === 0) readyBlockers.push("at least one subtask");
    // A repeat rule stands in for the deadline: each period's end bounds that
    // period's occurrence, so a recurring goal needs no date of its own.
    if (!item.deadline && !plannerHasFlexibleRecurrence(item)) {
      readyBlockers.push("a deadline or a repeat rule");
    }
  }
  const canMarkReady = readyBlockers.length === 0;

  // Dependency gate: a prerequisite under an unready goal root blocks
  // readying; a READY goal depending on this one (or any node in its
  // subtree) blocks un-readying. Node-level edges resolve through the
  // endpoint's containing root — interior endpoints render "part of <root>"
  // and withhold the shortcut (readiness cascades from roots only). Entries
  // carry the edge id so the popover's Disconnect removes the exact row.
  const toGateEntry = (entry: {
    edgeId: string;
    endpoint: Planner;
    root: Planner;
  }): GateEntry => ({
    edgeId: entry.edgeId,
    goal: entry.root,
    viaNode: entry.endpoint.id !== entry.root.id ? entry.endpoint : undefined,
  });
  const dependencyBlockerEntries: GateEntry[] = dependencyReadyBlockers(
    item.id,
    dependencies,
    planner,
  ).map(toGateEntry);

  const readyDependentEntries: GateEntry[] = readyDependents(
    item.id,
    dependencies,
    planner,
  ).map(toGateEntry);

  // Block un-readying when the item already has completed work — either the
  // root itself or anything in its subtree.
  const hasCompletedActivity = (() => {
    if (item.completedEndTime) return true;
    if (isGoal) {
      const treeIds = new Set(getTaskTreeIds(planner, item.id));
      return planner.some(
        (p) => treeIds.has(p.id) && p.id !== item.id && !!p.completedEndTime,
      );
    }
    return false;
  })();

  const onReadyClick = () => {
    if (
      !item.isReady &&
      (!canMarkReady || dependencyBlockerEntries.length > 0)
    ) {
      const parts: string[] = [];
      if (!canMarkReady) {
        parts.push(
          readyBlockers.length === 1
            ? `Needs ${readyBlockers[0]}.`
            : `Needs ${readyBlockers.slice(0, -1).join(", ")} and ${readyBlockers[readyBlockers.length - 1]}.`,
        );
      }
      for (const entry of dependencyBlockerEntries) {
        parts.push(
          entry.viaNode
            ? `Awaiting "${entry.viaNode.title || "Untitled"}" (part of "${entry.goal.title || "Untitled"}").`
            : `Awaiting "${entry.goal.title || "Untitled"}".`,
        );
      }
      flashReadyMessage(parts.join(" "));
      return;
    }
    if (item.isReady && hasCompletedActivity) {
      flashReadyMessage("Has completed work — cannot un-ready.");
      return;
    }
    if (item.isReady && readyDependentEntries.length > 0) {
      flashReadyMessage(
        `Required by ${readyDependentEntries
          .map((entry) =>
            entry.viaNode
              ? `"${entry.viaNode.title || "Untitled"}" (part of "${entry.goal.title || "Untitled"}")`
              : `"${entry.goal.title || "Untitled"}"`,
          )
          .join(", ")}.`,
      );
      return;
    }
    flashReadyMessage(null);
    handleToggleReady();
  };

  // Shortcut actions on the gate popover. Each is itself gated — a blocked
  // target shows its blockers in place rather than cascading.
  const applyReadyShortcut = (goal: Planner): string | null => {
    const missing: string[] = [];
    if (!planner.some((p) => p.parentId === goal.id)) {
      missing.push("at least one subtask");
    }
    if (!goal.deadline) missing.push("a deadline");
    const ownBlockers = dependencyReadyBlockers(goal.id, dependencies, planner);
    if (missing.length > 0 || ownBlockers.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`needs ${missing.join(" and ")}`);
      if (ownBlockers.length > 0) {
        parts.push(
          `awaiting ${ownBlockers.map((b) => `"${b.endpoint.title || "Untitled"}"`).join(", ")}`,
        );
      }
      return `"${goal.title || "Untitled"}" ${parts.join("; ")}.`;
    }
    setGoalIsReady(updatePlannerArray, goal.id, true);
    return null;
  };

  const applyUnreadyShortcut = (goal: Planner): string | null => {
    const treeIds = new Set(getTaskTreeIds(planner, goal.id));
    const hasCompleted =
      !!goal.completedEndTime ||
      planner.some(
        (p) => treeIds.has(p.id) && p.id !== goal.id && !!p.completedEndTime,
      );
    if (hasCompleted) {
      return `"${goal.title || "Untitled"}" has completed work — cannot un-ready.`;
    }
    const dependents = readyDependents(goal.id, dependencies, planner);
    if (dependents.length > 0) {
      return `"${goal.title || "Untitled"}" is required by ${dependents
        .map((d) => `"${d.root.title || "Untitled"}"`)
        .join(", ")}.`;
    }
    setGoalIsReady(updatePlannerArray, goal.id, false);
    return null;
  };

  const disconnectDependency = (edgeId: string) => {
    updateDependencyArray((prev) => prev.filter((d) => d.id !== edgeId));
  };

  return (
    <DraggableContextProvider>
      <ItemProvider
        value={{
          item,
          category,
          categories,
          subtasks,
          totalDuration,
          completedDuration,
          totalSubtasks,
          completedSubtasks,
          pct,
          locationOverrideEnabled,
          categoryHasLocation,
          saveTitle: handleSaveTitle,
          updateField: handleUpdateField,
          changeColor: handleColorChange,
          setPlannerType: (t: PlannerType) =>
            handleUpdateField("plannerType", t),
          changeCategory: handleCategoryChange,
          changeLocation: handleLocationChange,
          toggleLocationOverride: handleToggleLocationOverride,
          changeDate: handleDateChange,
          toggleReady: handleToggleReady,
          requestDelete: () => setShowDeleteConfirm(true),
          requestResetSubgoalLocations: () =>
            setShowResetLocationsConfirm(true),
        }}
      >
        <div className={page}>
          <div className={scrollArea}>
            <div className={innerWrap}>
              <div className={backRow}>
                <button
                  type="button"
                  className={backLink}
                  onClick={() => router.push(backTarget.href)}
                >
                  <ArrowLeft size={12} strokeWidth={2.4} />
                  {backTarget.label}
                </button>
              </div>

              <div className={titleBlock}>
                <div className={editableTitleWrap}>
                  {editingTitle ? (
                    <Input
                      autoFocus
                      variant="titleInline"
                      className={titleEditInput}
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={onTitleKey}
                    />
                  ) : (
                    <div className={titleHoverRow}>
                      <h1
                        className={`${titleStyle} ${titleClickable}`}
                        onClick={beginEditTitle}
                        title="Click to rename"
                      >
                        {item.title}
                      </h1>
                      <button
                        type="button"
                        className={renamePencil}
                        onClick={beginEditTitle}
                        aria-label="Rename"
                      >
                        <SquarePen size={16} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>

                <div className={headActions}>
                  {showReadyToggle && (
                    <div className={readyCluster}>
                      <Button
                        variant={item.isReady ? "solid" : "glass"}
                        size="sm"
                        onClick={onReadyClick}
                        style={{
                          minWidth: 124,
                          justifyContent: "center",
                          transition: interactiveTransition(
                            "background-color",
                            "border-color",
                            "color",
                          ),
                          ...(item.isReady
                            ? {
                                background: vars.status.success,
                                borderColor: vars.status.success,
                                color: vars.textOnAccent,
                              }
                            : {}),
                        }}
                      >
                        <Check size={12} strokeWidth={2.4} />
                        {item.isReady ? "Ready" : "Mark ready"}
                      </Button>
                      {!item.isReady && (
                        <DependencyGatePopover
                          mode="ready"
                          entries={dependencyBlockerEntries}
                          onApply={applyReadyShortcut}
                          onDisconnect={disconnectDependency}
                        />
                      )}
                      {item.isReady && (
                        <DependencyGatePopover
                          mode="unready"
                          entries={readyDependentEntries}
                          onApply={applyUnreadyShortcut}
                          onDisconnect={disconnectDependency}
                        />
                      )}
                      {readyMessage && (
                        <div className={readyHint}>{readyMessage}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <ItemTabs
                itemId={item.id}
                subtaskCount={totalSubtasks}
                subtasksEnabled={isGoal}
              />

              <div className={tabBodyWrap}>{children}</div>
              <div className={deleteDock}>
                <DeleteRow />
              </div>
            </div>
          </div>

          <ConfirmModal
            open={showDeleteConfirm}
            title="Delete item"
            body={
              <>
                Are you sure you want to delete <strong>{item.title}</strong>?
                {isGoal && totalSubtasks > 0 && (
                  <>
                    {" "}
                    This will also delete {totalSubtasks} subtask
                    {totalSubtasks !== 1 ? "s" : ""}.
                  </>
                )}
                {loggedHistoryCount > 0 && (
                  <>
                    {" "}
                    Its {loggedHistoryCount} completed instance
                    {loggedHistoryCount !== 1 ? "s" : ""} of history will be
                    erased too.
                  </>
                )}
              </>
            }
            confirmLabel="Delete"
            cancelLabel="Cancel"
            tone="danger"
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={handleDelete}
          />

          <ConfirmModal
            open={showResetLocationsConfirm}
            title="Reset sub-goal places"
            body="Reset all sub-goal places to inherited? This will remove any custom location overrides on descendant items."
            confirmLabel="Reset all"
            cancelLabel="Cancel"
            onCancel={() => setShowResetLocationsConfirm(false)}
            onConfirm={confirmResetSubgoalLocations}
          />
        </div>
      </ItemProvider>
    </DraggableContextProvider>
  );
}
