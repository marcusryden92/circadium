"use client";

import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Check, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { RootState } from "@/redux/store";
import type { Planner } from "@/types/prisma";
import { DateTimePicker } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { getTreeBottomLayer } from "@/utils/goalPageHandlers";
import { formatDatetimeLocal, parseDatetimeLocal } from "@/utils/datetime";
import {
  buildRecurringInstances,
  isLeafLoggedForPeriod,
  manualCompletionWindow,
  INSTANCE_HORIZON_DAYS,
  INSTANCE_MAX_ROWS,
  type RecurringInstance,
} from "@/utils/recurringInstances";
import { useOccurrenceCompletion } from "./useOccurrenceCompletion";
import { formatPeriodLabel } from "./periodLabel";
import {
  overlay,
  modal,
  header,
  headerText,
  title,
  subtitle,
  closeBtn,
  columns,
  instanceListCol,
  instanceListRow,
  instanceListLabel,
  statusPill,
  panel,
  panelHeading,
  treeRow,
  treeName,
  treeNameParent,
  treeRowActions,
  checkbox,
  rollup,
  modalEmpty,
} from "./RecurringCompletion.css";

const STATUS_LABEL: Record<RecurringInstance["status"], string> = {
  completed: "Done",
  missed: "Missed",
  pending: "Open",
  upcoming: "Upcoming",
};

interface SubtreeRow {
  node: Planner;
  depth: number;
  isLeaf: boolean;
}

function buildSubtreeRows(planner: Planner[], rootId: string): SubtreeRow[] {
  const childrenByParent = new Map<string, Planner[]>();
  for (const p of planner) {
    if (!p.parentId) continue;
    const list = childrenByParent.get(p.parentId);
    if (list) list.push(p);
    else childrenByParent.set(p.parentId, [p]);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const rows: SubtreeRow[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      const kids = childrenByParent.get(child.id) ?? [];
      rows.push({ node: child, depth, isLeaf: kids.length === 0 });
      if (kids.length) walk(child.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return rows;
}

interface RecurringCompletionModalProps {
  open: boolean;
  goal: Planner;
  initialPeriodKey: string | null;
  onClose: () => void;
}

// Completion-only surface for a recurring goal: instances on the left, and for
// the selected period the goal's tree on the right where the ONLY editable
// thing is per-leaf completion (structure lives in the subtasks view). A period
// is done when every leaf is logged; parents show a live rollup.
export function RecurringCompletionModal({
  open,
  goal,
  initialPeriodKey,
  onClose,
}: RecurringCompletionModalProps) {
  const { planner, updateAll, weekStartDay } = useCalendarProvider();
  const rows = useSelector((s: RootState) => s.occurrenceCompletions.rows);
  const setCompleted = useOccurrenceCompletion(updateAll);

  const instances = useMemo(
    () =>
      buildRecurringInstances({
        item: goal,
        planners: planner,
        completions: rows,
        now: new Date(),
        horizonDays: INSTANCE_HORIZON_DAYS,
        limit: INSTANCE_MAX_ROWS,
      }),
    [goal, planner, rows],
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    if (open) setSelectedKey(initialPeriodKey);
  }, [open, initialPeriodKey]);

  const effectiveKey = selectedKey ?? instances[0]?.key ?? null;
  const selected = instances.find((i) => i.key === effectiveKey) ?? null;

  const subtreeRows = useMemo(
    () => buildSubtreeRows(planner, goal.id),
    [planner, goal.id],
  );

  const loggedFor = (leafId: string) =>
    selected ? isLeafLoggedForPeriod(rows, leafId, selected.key) : null;

  const toggleLeaf = (leaf: Planner) => {
    if (!selected) return;
    const existing = isLeafLoggedForPeriod(rows, leaf.id, selected.key);
    setCompleted(
      leaf.id,
      selected.key,
      existing
        ? null
        : manualCompletionWindow(selected, leaf.duration, new Date()),
    );
  };

  // Edit a completed leaf's logged time (start back-dated by the leaf's
  // duration); clearing the picker un-completes it for this period.
  const editLeafTime = (leaf: Planner, value: string) => {
    if (!selected) return;
    const endIso = parseDatetimeLocal(value);
    if (!endIso) {
      setCompleted(leaf.id, selected.key, null);
      return;
    }
    const start = new Date(
      new Date(endIso).getTime() - Math.max(1, leaf.duration) * 60_000,
    );
    setCompleted(leaf.id, selected.key, {
      start: start.toISOString(),
      end: endIso,
    });
  };

  const rollupFor = (nodeId: string): string => {
    if (!selected) return "";
    const leaves = getTreeBottomLayer(planner, nodeId);
    const done = leaves.filter((l) => !!loggedFor(l.id)).length;
    return `${done}/${leaves.length}`;
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content className={modal} aria-describedby={undefined}>
          <div className={header}>
            <div className={headerText}>
              <Dialog.Title className={title}>Manage completion</Dialog.Title>
              <span className={subtitle}>
                Mark each period&apos;s subtasks done for{" "}
                {goal.title || "this goal"}. Structure is edited in Subtasks.
              </span>
            </div>
            <button
              type="button"
              className={closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className={columns}>
            <div className={instanceListCol}>
              {instances.length === 0 ? (
                <span className={subtitle}>No instances yet.</span>
              ) : (
                instances.map((inst) => (
                  <button
                    key={inst.key}
                    type="button"
                    className={instanceListRow}
                    data-active={inst.key === effectiveKey}
                    onClick={() => setSelectedKey(inst.key)}
                  >
                    <span className={instanceListLabel}>
                      {formatPeriodLabel(inst)}
                    </span>
                    <span className={statusPill} data-status={inst.status}>
                      {inst.status === "completed"
                        ? STATUS_LABEL.completed
                        : `${inst.doneLeaves}/${inst.totalLeaves}`}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className={panel}>
              {selected ? (
                <>
                  <div className={panelHeading}>
                    {formatPeriodLabel(selected)}
                  </div>
                  {subtreeRows.map(({ node, depth, isLeaf }) => {
                    const logged = isLeaf ? loggedFor(node.id) : null;
                    const done = !!logged;
                    return (
                      <div
                        key={node.id}
                        className={treeRow}
                        style={{ paddingLeft: depth * 18 }}
                      >
                        <span className={isLeaf ? treeName : treeNameParent}>
                          {node.title || "Untitled"}
                        </span>
                        {isLeaf ? (
                          <div className={treeRowActions}>
                            {done && (
                              <DateTimePicker
                                variant="bare"
                                size="sm"
                                value={formatDatetimeLocal(logged?.end)}
                                onChange={(value) => editLeafTime(node, value)}
                                weekStartsOn={weekStartDay}
                                clearable
                                ariaLabel="Completed at"
                              />
                            )}
                            <button
                              type="button"
                              className={checkbox}
                              data-completed={done}
                              onClick={() => toggleLeaf(node)}
                              aria-label={
                                done ? "Mark incomplete" : "Mark complete"
                              }
                            >
                              {done && <Check size={14} strokeWidth={3} />}
                            </button>
                          </div>
                        ) : (
                          <span className={rollup}>{rollupFor(node.id)}</span>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className={modalEmpty}>Select a period to manage it.</div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
