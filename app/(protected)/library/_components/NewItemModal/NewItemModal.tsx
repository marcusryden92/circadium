"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  BottomSheet,
  Button,
  Caption,
  DurationField,
  Input,
  SegmentedControl,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fallbackCalendarColor } from "@/utils/colorUtils";
import { defaultReadyForType } from "@/utils/plannerReadiness";
import { PRIORITY_DEFAULT } from "@/utils/plannerPriority";
import type { Planner } from "@/types/prisma";
import {
  overlay,
  dialog,
  header,
  field,
  fieldLabel,
  footer,
  sheetStack,
} from "./NewItemModal.css";

type NewItemType = "task" | "plan" | "goal";

const DEFAULT_DURATION_MINUTES = 30;
// Non-goal items must carry a positive duration or the engine rejects them and
// blanks the calendar; goals are duration-exempt and size from their subtasks.
const MIN_DURATION_MINUTES = 15;

export function NewItemModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { userId, updatePlannerArray } = useCalendarProvider();
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<NewItemType>("task");
  const [duration, setDuration] = useState(DEFAULT_DURATION_MINUTES);

  useEffect(() => {
    if (open) {
      setTitle("");
      setType("task");
      setDuration(DEFAULT_DURATION_MINUTES);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const canSubmit = title.trim().length > 0;

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const isGoal = type === "goal";
    const resolvedDuration = isGoal
      ? 0
      : Math.max(MIN_DURATION_MINUTES, duration);

    const id = uuidv4();
    const newItem: Planner = {
      id,
      title: trimmed,
      parentId: null,
      plannerType: type,
      isReady: defaultReadyForType(type),
      // Library-created items are managed items, not inbox jots — they skip
      // the triage queue and are immediately visible to scheduling and the
      // AI assistant.
      isTriaged: true,
      duration: resolvedDuration,
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
      // A palette color keyed on the id, not the silent red default.
      color: fallbackCalendarColor(id),
      locationId: null,
      useParentLocation: false,
      categoryId: null,
      createdAt: now,
      updatedAt: now,
    };
    updatePlannerArray((prev: Planner[]) => [...prev, newItem]);
    onOpenChange(false);
    router.push(`/items/${id}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !canSubmit) return;
    e.preventDefault();
    create();
  };

  const content = (
    <>
      <div className={header}>
        <Caption>new item · goes straight to your library</Caption>
      </div>

      <Input
        ref={inputRef}
        variant="underline"
        placeholder="What is it?"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className={field}>
        <span className={fieldLabel}>Type</span>
        <SegmentedControl<NewItemType>
          value={type}
          onChange={setType}
          options={[
            { key: "task", label: "Task" },
            { key: "plan", label: "Plan" },
            { key: "goal", label: "Goal" },
          ]}
        />
      </div>

      {type !== "goal" && (
        <div className={field}>
          <span className={fieldLabel}>Duration</span>
          <DurationField
            minutes={duration}
            onCommit={setDuration}
            minMinutes={MIN_DURATION_MINUTES}
          />
        </div>
      )}

      <div className={footer}>
        <Button variant="glass" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="solid"
          size="sm"
          onClick={create}
          disabled={!canSubmit}
        >
          Create
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="New item"
        hideTitle
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={sheetStack}>{content}</div>
      </BottomSheet>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title style={{ position: "absolute", left: -10000 }}>
            New item
          </Dialog.Title>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
