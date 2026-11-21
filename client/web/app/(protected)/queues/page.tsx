"use client";

import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Combobox,
  ConfirmModal,
  Input,
  Loader,
  PageHeader,
  useTheme,
  vars,
  categoryColor,
  type ComboboxOption,
} from "@/components/ui";
import { PopoverColorPicker } from "@/components/events/PopoverColorPicker";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { Queue } from "@/types/prisma";
import {
  addQueueMember,
  removeQueueMember,
  reorderQueueMember,
} from "@/utils/queue-handlers/mutateQueueMembers";
import { describeCycle } from "@/utils/precedence/describeCycle";
import { historyMessages } from "@/utils/historyMessages";
import { QueueRail } from "./_components/QueueRail";
import { QueueMemberList } from "./_components/QueueMemberList";
import { AddMemberModal } from "./_components/AddMemberModal";
import {
  page,
  mainGrid,
  rail,
  railHead,
  railBody,
  railFooter,
  railNewButton,
  mainCard,
  emptyMain,
  errorBanner,
  queueHeader,
  queueTitleInput,
  headerControls,
  headerControlLabel,
  memberSection,
  memberFooter,
  addMemberButton,
} from "./page.css";

const sortQueues = (queues: Queue[]): Queue[] =>
  [...queues].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );

export default function QueuesPage() {
  const {
    userId,
    isLoaded,
    planner,
    categories,
    queues,
    dependencies,
    updateQueueArray,
  } = useCalendarProvider();

  const { dark } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cycleError, setCycleError] = useState<string | null>(null);

  const orderedQueues = useMemo(() => sortQueues(queues), [queues]);

  const effectiveSelectedId =
    selectedId ?? (orderedQueues.length > 0 ? orderedQueues[0].id : null);
  const selected = useMemo(
    () =>
      effectiveSelectedId
        ? queues.find((q) => q.id === effectiveSelectedId) ?? null
        : null,
    [queues, effectiveSelectedId],
  );

  const memberCount = useMemo(
    () => queues.reduce((sum, q) => sum + q.members.length, 0),
    [queues],
  );

  const categoryOptions = useMemo<ComboboxOption<string | null>[]>(
    () => [
      { value: null, label: "None" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  // All queue-member writes go through the mutateQueueMembers choke point so
  // the merged-graph cycle validator has exactly one seam; a refused mutation
  // surfaces the closing path in the banner instead of applying.
  const handleAddMember = (plannerId: string) => {
    if (!selected) return;
    const result = addQueueMember({
      queues,
      dependencies,
      queueId: selected.id,
      plannerId,
      userId,
      planner,
    });
    if (!result.ok) {
      setCycleError(describeCycle(result.cycle, planner, queues));
      return;
    }
    setCycleError(null);
    updateQueueArray(
      result.queues,
      historyMessages.queue.addMember(
        planner.find((p) => p.id === plannerId)?.title,
      ),
    );
  };

  const handleReorderMember = (plannerId: string, toIndex: number) => {
    if (!selected) return;
    const result = reorderQueueMember({
      queues,
      dependencies,
      queueId: selected.id,
      plannerId,
      toIndex,
      planner,
    });
    if (!result.ok) {
      setCycleError(
        `That order would create a loop: ${describeCycle(result.cycle, planner, queues)}`,
      );
      return;
    }
    setCycleError(null);
    updateQueueArray(
      result.queues,
      historyMessages.queue.reorderMember(
        planner.find((p) => p.id === plannerId)?.title,
      ),
    );
  };

  const handleRemoveMember = (plannerId: string) => {
    setCycleError(null);
    updateQueueArray(
      (prev) => removeQueueMember(prev, plannerId),
      historyMessages.queue.removeMember(
        planner.find((p) => p.id === plannerId)?.title,
      ),
    );
  };

  const handleCreate = () => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const maxOrder = queues.reduce((max, q) => Math.max(max, q.sortOrder), -1);
    const created: Queue = {
      id,
      title: "New queue",
      sortOrder: maxOrder + 1,
      color: null,
      categoryId: null,
      userId,
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    updateQueueArray(
      (prev) => [...prev, created],
      historyMessages.queue.create(created.title),
    );
    setSelectedId(id);
  };

  const handleRename = (title: string) => {
    if (!selected) return;
    updateQueueArray(
      (prev) => prev.map((q) => (q.id === selected.id ? { ...q, title } : q)),
      historyMessages.queue.rename(title),
    );
  };

  const handleChangeCategory = (categoryId: string | null) => {
    if (!selected) return;
    updateQueueArray(
      (prev) =>
        prev.map((q) => (q.id === selected.id ? { ...q, categoryId } : q)),
      historyMessages.queue.recategorize(selected.title),
    );
  };

  const handleChangeColor = (color: string) => {
    if (!selected) return;
    updateQueueArray(
      (prev) => prev.map((q) => (q.id === selected.id ? { ...q, color } : q)),
      historyMessages.queue.recolor(selected.title),
    );
  };

  // Dense-int renumber on rail reorder (categories-rail precedent) — the
  // queue list is short and queue-row updates are cheap.
  const handleReorderQueue = (queueId: string, toIndex: number) => {
    const without = orderedQueues.filter((q) => q.id !== queueId);
    const moved = orderedQueues.find((q) => q.id === queueId);
    if (!moved) return;
    without.splice(Math.max(0, Math.min(toIndex, without.length)), 0, moved);
    updateQueueArray(
      (prev) =>
        prev.map((q) => {
          const index = without.findIndex((w) => w.id === q.id);
          if (index === -1 || q.sortOrder === index) return q;
          return { ...q, sortOrder: index };
        }),
      historyMessages.queue.reorderQueues,
    );
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    if (effectiveSelectedId === deletingId) {
      const remaining = orderedQueues.filter((q) => q.id !== deletingId);
      setSelectedId(remaining[0]?.id ?? null);
    }
    updateQueueArray(
      (prev) => prev.filter((q) => q.id !== deletingId),
      historyMessages.queue.delete(
        queues.find((q) => q.id === deletingId)?.title,
      ),
    );
    setDeletingId(null);
  };

  const deletingQueue = deletingId
    ? queues.find((q) => q.id === deletingId)
    : undefined;

  return (
    <div className={page}>
      <PageHeader
        title="Queues"
        summary={
          <>
            {orderedQueues.length} queue{orderedQueues.length === 1 ? "" : "s"}{" "}
            · {memberCount} item{memberCount === 1 ? "" : "s"} in line
          </>
        }
      />

      {cycleError && <div className={errorBanner}>{cycleError}</div>}

      <div className={mainGrid}>
        <aside className={rail}>
          <div className={railHead}>Queues</div>
          <div className={railBody}>
            {!isLoaded ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px 8px",
                }}
              >
                <Loader size="md" label="Loading queues" />
              </div>
            ) : orderedQueues.length === 0 ? (
              <div
                style={{
                  padding: "12px 8px",
                  fontSize: 12.5,
                  color: vars.muted,
                }}
              >
                No queues yet — create one to line up work.
              </div>
            ) : (
              <QueueRail
                queues={orderedQueues}
                selectedId={effectiveSelectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setCycleError(null);
                }}
                onReorder={handleReorderQueue}
              />
            )}
          </div>
          <div className={railFooter}>
            <Button
              variant="ghost"
              size="sm"
              className={railNewButton}
              onClick={handleCreate}
              disabled={!isLoaded}
            >
              <Plus size={13} strokeWidth={2.4} />
              New queue
            </Button>
          </div>
        </aside>

        <section className={mainCard}>
          {!isLoaded ? (
            <div className={emptyMain}>
              <Loader size="md" label="Loading queues" />
            </div>
          ) : selected ? (
            <>
              <div className={queueHeader}>
                <Input
                  variant="titleInline"
                  className={queueTitleInput}
                  value={selected.title}
                  placeholder="Queue name"
                  onChange={(e) => handleRename(e.target.value)}
                  aria-label="Queue name"
                />
                <div className={headerControls}>
                  <PopoverColorPicker
                    currentColor={
                      selected.color ??
                      categoryColor(
                        selected.categoryId
                          ? categories.find(
                              (c) => c.id === selected.categoryId,
                            )
                          : null,
                        dark ? "dark" : "light",
                      )
                    }
                    onChange={handleChangeColor}
                  />
                  <span className={headerControlLabel}>Category</span>
                  <Combobox
                    value={selected.categoryId}
                    options={categoryOptions}
                    onChange={handleChangeCategory}
                    ariaLabel="Queue category"
                    placeholder="None"
                    maxWidth={180}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(selected.id)}
                    aria-label="Delete queue"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </Button>
                </div>
              </div>
              <div className={memberSection}>
                <QueueMemberList
                  queue={selected}
                  planner={planner}
                  categories={categories}
                  onReorder={handleReorderMember}
                  onRemove={handleRemoveMember}
                />
              </div>
              <div className={memberFooter}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={addMemberButton}
                  onClick={() => setAddOpen(true)}
                >
                  <Plus size={13} strokeWidth={2.4} />
                  Add item
                </Button>
              </div>
            </>
          ) : (
            <div className={emptyMain}>
              Create a queue to line up tasks and goals — they will be
              scheduled in order, each starting after the one before it ends.
            </div>
          )}
        </section>
      </div>

      {selected && (
        <AddMemberModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          queue={selected}
          queues={queues}
          dependencies={dependencies}
          planner={planner}
          onPick={handleAddMember}
        />
      )}

      <ConfirmModal
        open={!!deletingId}
        title="Delete queue?"
        tone="danger"
        confirmLabel="Delete"
        body={
          <p style={{ margin: 0 }}>
            Delete &ldquo;{deletingQueue?.title ?? "this queue"}&rdquo;? The
            items in it are kept — they just stop being scheduled in sequence.
          </p>
        }
        onCancel={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
