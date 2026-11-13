"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, CornerDownRight, Plus, X } from "lucide-react";
import {
  BottomSheet,
  Caption,
  ConfirmModal,
  TypeBadge,
} from "@/components/ui";
import { GoalPickerList } from "@/components/GoalPickerList";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCalendarProvider } from "@/context/CalendarProvider";
import {
  buildDemoteLossManifest,
  demoteRootIntoGoal,
} from "@/utils/goal-handlers/demoteRootIntoGoal";
import { DependencyPickerModal } from "../DependencyPickerModal";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import { getRootParentId } from "@/utils/goalPageHandlers";
import { isValidDependencyEndpoint } from "@/utils/precedence/endpoints";
import { wouldCreateCycleAddingNodeDependency } from "@/utils/precedence/findCycle";
import { describeCycle } from "@/utils/precedence/describeCycle";
import { historyMessages } from "@/utils/historyMessages";
import type { PlannerDependency } from "@/types/prisma";
import { useItem } from "../ItemContext";
import {
  card,
  nextCardHeaderRow,
  nextCardLink,
  nextCardTitle,
  nextCardSub,
  nextCardBody,
  cardSectionTitle,
  whyText,
  depGroupLabel,
  depGroupHeader,
  depGroupHeaderLabel,
  depAddBtn,
  depRow,
  depTitleLink,
  depRemove,
  depError,
  depEmpty,
  connectionsRow,
  connectionsCount,
  connOverlay,
  connDialog,
  connHeader,
  connTitle,
  connBody,
  nestActionRow,
  nestModalBody,
} from "./SideCards.css";

export function NextOnCalendarCard() {
  const { item } = useItem();
  const { calendar } = useCalendarProvider();

  const next = useMemo(() => {
    const now = Date.now();
    const isGoal = item.plannerType === "goal";
    const candidates = calendar
      .filter((e) => {
        if (plannerIdFromEventId(e.id) === item.id) return true;
        if (!isGoal) return false;
        const ext = e.extendedProps as { parentId?: string | null } | undefined;
        return ext?.parentId === item.id;
      })
      .filter((e) => new Date(e.start).getTime() >= now)
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    return candidates[0];
  }, [calendar, item.id, item.plannerType]);

  return (
    <div className={card}>
      <div className={nextCardHeaderRow}>
        <span className={cardSectionTitle}>Next on calendar</span>
        <Link href="/calendar" className={nextCardLink}>
          View calendar →
        </Link>
      </div>
      <div className={nextCardBody}>
        {next ? (
          <>
            <div className={nextCardTitle}>
              {format(new Date(next.start), "EEE")} ·{" "}
              {format(new Date(next.start), "HH:mm")}
            </div>
            <div className={nextCardSub}>
              {next.title} ·{" "}
              {Math.round(
                (new Date(next.end).getTime() -
                  new Date(next.start).getTime()) /
                  60000,
              )}
              m
            </div>
          </>
        ) : (
          <Caption>Not scheduled yet.</Caption>
        )}
      </div>
    </div>
  );
}

// Every precedence-ish relation on one card: queue membership, dependency
// edges (with the add picker), and detour hosts. Groups render only when they
// apply; the card disappears entirely for items with nothing to connect.
export function ConnectionsCard() {
  const { item } = useItem();
  const {
    userId,
    planner,
    queues,
    dependencies,
    updateDependencyArray,
    queueByPlannerId,
  } = useCalendarProvider();
  const [error, setError] = useState<string | null>(null);

  const queue = queueByPlannerId.get(item.id);

  const plannerById = useMemo(
    () => new Map(planner.map((p) => [p.id, p])),
    [planner],
  );

  const hosts = useMemo(() => {
    if (item.parentId != null) return [];
    return planner
      .filter((p) => p.linkedItemId === item.id)
      .map((placeholder) => {
        const rootId = getRootParentId(planner, placeholder.id);
        const host = rootId ? planner.find((p) => p.id === rootId) : undefined;
        return { placeholder, host };
      })
      .filter(
        (
          x,
        ): x is {
          placeholder: (typeof planner)[number];
          host: NonNullable<typeof x.host>;
        } => !!x.host,
      );
  }, [planner, item.id, item.parentId]);

  const dependsOn = useMemo(
    () =>
      dependencies
        .filter((d) => d.successorId === item.id)
        .map((d) => ({
          edge: d,
          predecessor: plannerById.get(d.predecessorId),
        }))
        .filter(
          (
            x,
          ): x is {
            edge: PlannerDependency;
            predecessor: NonNullable<typeof x.predecessor>;
          } => !!x.predecessor,
        ),
    [dependencies, item.id, plannerById],
  );

  const requiredBy = useMemo(
    () =>
      dependencies
        .filter((d) => d.predecessorId === item.id)
        .map((d) => ({ edge: d, successor: plannerById.get(d.successorId) }))
        .filter(
          (
            x,
          ): x is {
            edge: PlannerDependency;
            successor: NonNullable<typeof x.successor>;
          } => !!x.successor,
        ),
    [dependencies, item.id, plannerById],
  );

  // Ids already linked either way — hidden from the picker.
  const linkedIds = useMemo(() => {
    const linked = new Set<string>();
    for (const d of dependencies) {
      if (d.successorId === item.id) linked.add(d.predecessorId);
      if (d.predecessorId === item.id) linked.add(d.successorId);
    }
    return linked;
  }, [dependencies, item.id]);

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAdd = (predecessorId: string | null) => {
    if (!predecessorId) return;
    // Commit-time hard check — the picker ghosts prohibited options, but the
    // add must stand on its own.
    const refusal = wouldCreateCycleAddingNodeDependency(
      planner,
      queues,
      dependencies,
      predecessorId,
      item.id,
    );
    if (refusal === "same-root") {
      setError("Same goal — order is set by the list.");
      return;
    }
    if (refusal) {
      setError(
        `That link would create a loop: ${describeCycle(refusal, planner, queues)}`,
      );
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    updateDependencyArray(
      (prev) =>
        prev.some(
          (d) =>
            d.predecessorId === predecessorId && d.successorId === item.id,
        )
          ? prev
          : [
              ...prev,
              {
                id: uuidv4(),
                predecessorId,
                successorId: item.id,
                userId,
                createdAt: now,
                updatedAt: now,
              },
            ],
      historyMessages.dependency.add(
        planner.find((p) => p.id === predecessorId)?.title,
      ),
    );
  };

  const handleRemove = (edgeId: string) => {
    setError(null);
    updateDependencyArray(
      (prev) => prev.filter((d) => d.id !== edgeId),
      historyMessages.dependency.remove(
        planner.find(
          (p) =>
            p.id ===
            dependencies.find((d) => d.id === edgeId)?.predecessorId,
        )?.title,
      ),
    );
  };

  // Dependencies exist between any non-plan nodes whose structural roots are
  // triaged — subtasks included (node-level edges).
  const canHaveDependencies = isValidDependencyEndpoint(plannerById, item.id);

  const [manageOpen, setManageOpen] = useState(false);
  const isMobile = useIsMobile();

  if (!canHaveDependencies && !queue && hosts.length === 0) return null;

  const count =
    (queue ? 1 : 0) + dependsOn.length + requiredBy.length + hosts.length;

  const groups = (
    <>
      {queue && (
        <>
          <span className={depGroupLabel}>In queue</span>
          <div className={depRow}>
            <Link href="/queues" className={depTitleLink}>
              {queue.title || "Untitled queue"}
            </Link>
          </div>
        </>
      )}

      {canHaveDependencies && (
        <>
          <div className={depGroupHeader}>
            <span className={depGroupHeaderLabel}>Depends on</span>
            <button
              type="button"
              className={depAddBtn}
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={11} strokeWidth={2.4} />
              Add
            </button>
          </div>
          {dependsOn.length === 0 ? (
            <div className={depEmpty}>No prerequisites.</div>
          ) : (
            dependsOn.map(({ edge, predecessor }) => (
              <div key={edge.id} className={depRow}>
                <TypeBadge size="sm">{predecessor.plannerType}</TypeBadge>
                <Link
                  href={`/items/${predecessor.id}`}
                  className={depTitleLink}
                >
                  {predecessor.title || "Untitled"}
                </Link>
                <button
                  type="button"
                  className={depRemove}
                  onClick={() => handleRemove(edge.id)}
                  aria-label={`Remove dependency on ${predecessor.title || "item"}`}
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              </div>
            ))
          )}
          {error && <div className={depError}>{error}</div>}

          {requiredBy.length > 0 && (
            <>
              <span className={depGroupLabel}>Required by</span>
              {requiredBy.map(({ edge, successor }) => (
                <div key={edge.id} className={depRow}>
                  <TypeBadge size="sm">{successor.plannerType}</TypeBadge>
                  <Link
                    href={`/items/${successor.id}`}
                    className={depTitleLink}
                  >
                    {successor.title || "Untitled"}
                  </Link>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {hosts.length > 0 && (
        <>
          <span className={depGroupLabel}>Linked into</span>
          <div className={whyText}>
            This item&apos;s work is spliced into the sequence of:
          </div>
          {hosts.map(({ placeholder, host }) => (
            <div key={placeholder.id} className={depRow}>
              <TypeBadge size="sm">{host.plannerType}</TypeBadge>
              <Link href={`/items/${host.id}`} className={depTitleLink}>
                {host.title || "Untitled"}
              </Link>
            </div>
          ))}
        </>
      )}
    </>
  );

  return (
    <div className={card}>
      <button
        type="button"
        className={connectionsRow}
        onClick={() => setManageOpen(true)}
        aria-haspopup="dialog"
      >
        <span className={cardSectionTitle}>Connections</span>
        <span className={connectionsCount}>{count}</span>
        <ChevronRight size={13} strokeWidth={2.2} />
      </button>

      {isMobile ? (
        <BottomSheet
          open={manageOpen}
          onOpenChange={(next) => {
            if (!next) setManageOpen(false);
          }}
          title="Connections"
        >
          {groups}
        </BottomSheet>
      ) : (
        <Dialog.Root
          open={manageOpen}
          onOpenChange={(next) => {
            if (!next) setManageOpen(false);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className={connOverlay} />
            <Dialog.Content className={connDialog} aria-describedby={undefined}>
              <div className={connHeader}>
                <Dialog.Title className={connTitle}>Connections</Dialog.Title>
                <Link href="/graph" className={nextCardLink}>
                  Graph →
                </Link>
              </div>
              <div className={connBody}>{groups}</div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      <DependencyPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchor={item}
        planner={planner}
        queues={queues}
        dependencies={dependencies}
        linkedIds={linkedIds}
        onPick={handleAdd}
      />
    </div>
  );
}

const joinTitles = (titles: string[]): string =>
  titles.map((t) => `"${t}"`).join(", ");

// Demote entry point: nest this top-level item as a subtask of another goal.
// A rare structural action, so it rests as a single quiet row — picking the
// target and confirming happen in one modal, whose body enumerates everything
// the thunk's central pruning will drop (the helper itself never prunes).
export function NestIntoGoalCard() {
  const { item } = useItem();
  const { planner, queues, dependencies, updatePlannerArray } =
    useCalendarProvider();
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [demoteError, setDemoteError] = useState<string | null>(null);

  const eligible =
    item.parentId == null && item.isTriaged && item.plannerType !== "plan";

  const targetGoals = useMemo(
    () =>
      planner
        .filter(
          (p) =>
            p.parentId == null &&
            p.isTriaged &&
            p.plannerType === "goal" &&
            p.id !== item.id,
        )
        .sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [planner, item.id],
  );

  const manifest = useMemo(
    () =>
      targetId
        ? buildDemoteLossManifest(planner, queues, dependencies, item.id)
        : null,
    [targetId, planner, queues, dependencies, item.id],
  );

  if (!eligible || targetGoals.length === 0) return null;

  const dropsAnything =
    !!manifest &&
    (manifest.queueTitle !== null || manifest.inboundHostTitles.length > 0);

  const closeModal = () => {
    setPickerOpen(false);
    setTargetId(null);
  };

  const confirmDemote = () => {
    if (!targetId) return;
    const result = demoteRootIntoGoal(
      planner,
      item.id,
      targetId,
      queues,
      dependencies,
    );
    if (!Array.isArray(result)) {
      setDemoteError(result.error);
      return;
    }
    setDemoteError(null);
    updatePlannerArray(
      result,
      historyMessages.item.demote(
        item.title,
        planner.find((p) => p.id === targetId)?.title ?? "goal",
      ),
    );
    router.push(`/items/${targetId}/subtasks`);
  };

  return (
    <div className={card}>
      <button
        type="button"
        className={nestActionRow}
        onClick={() => setPickerOpen(true)}
      >
        <CornerDownRight size={13} strokeWidth={2.2} />
        Nest under a goal…
      </button>
      {demoteError && <div className={depError}>{demoteError}</div>}

      <ConfirmModal
        open={pickerOpen}
        title="Nest under a goal"
        body={
          <div className={nestModalBody}>
            <div>
              <strong>{item.title}</strong> and everything under it move inside
              the goal you pick, adopting its category and readiness. It stops
              being its own top-level item.
            </div>
            <GoalPickerList
              goals={targetGoals}
              onSelect={setTargetId}
              onSubmit={confirmDemote}
            />
            {targetId && manifest && (
              <div>
                {manifest.queueTitle && (
                  <div>
                    It leaves the <strong>{manifest.queueTitle}</strong> queue.
                  </div>
                )}
                {manifest.dependsOnTitles.length > 0 && (
                  <div>
                    It keeps waiting for {joinTitles(manifest.dependsOnTitles)}
                    .
                  </div>
                )}
                {manifest.requiredByTitles.length > 0 && (
                  <div>
                    {joinTitles(manifest.requiredByTitles)} still wait
                    {manifest.requiredByTitles.length === 1 ? "s" : ""} for it,
                    now as part of the new goal.
                  </div>
                )}
                {manifest.inboundHostTitles.length > 0 && (
                  <div>
                    Links into it from {joinTitles(manifest.inboundHostTitles)}{" "}
                    are removed.
                  </div>
                )}
                {manifest.outboundTargetTitles.length > 0 && (
                  <div>
                    Its links to {joinTitles(manifest.outboundTargetTitles)}{" "}
                    stay, but now run in the new goal&apos;s order.
                  </div>
                )}
                {dropsAnything && (
                  <div>
                    Dropped connections cannot be restored by promoting it back
                    later.
                  </div>
                )}
              </div>
            )}
          </div>
        }
        confirmLabel="Nest"
        cancelLabel="Cancel"
        confirmDisabled={!targetId}
        onCancel={closeModal}
        onConfirm={confirmDemote}
      />
    </div>
  );
}
