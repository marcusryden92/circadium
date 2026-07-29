"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Caption, Combobox, Input } from "@/components/ui";
import { createHabit } from "@/actions/habits";
import { upsertHabit } from "@/redux/slices/habitsSlice";
import type { AppDispatch } from "@/redux/store";
import type { HabitBucket } from "@/types/prisma";
import {
  overlay,
  dialog,
  field,
  fieldLabel,
  footer,
} from "./NewHabitModal.css";

// A habit is a pure tracker: name + bucket. The repeating items it tracks are
// created separately (item detail / capture / assistant) and linked from the
// habit card afterward.
export function NewHabitModal({
  open,
  onOpenChange,
  buckets,
  defaultBucketId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buckets: HabitBucket[];
  defaultBucketId?: string | null;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [bucketId, setBucketId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setBucketId(defaultBucketId ?? "");
      setSaving(false);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, defaultBucketId]);

  const canSubmit = name.trim().length > 0 && !saving;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const habit = await createHabit({
        name: trimmed,
        bucketId: bucketId || null,
      });
      dispatch(upsertHabit(habit));
      onOpenChange(false);
    } catch {
      setSaving(false);
    }
  };

  const bucketOptions = [
    { value: "", label: "No bucket" },
    ...buckets.map((b) => ({ value: b.id, label: b.name })),
  ];

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
            New habit
          </Dialog.Title>
          <Caption>new habit · tracked from the repeating items you link</Caption>

          <Input
            ref={inputRef}
            variant="underline"
            placeholder="What do you want to build?"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void create();
              }
            }}
          />

          <div className={field}>
            <span className={fieldLabel}>Bucket</span>
            <Combobox
              value={bucketId}
              options={bucketOptions}
              onChange={setBucketId}
              width="220px"
              ariaLabel="Habit bucket"
            />
          </div>

          <div className={footer}>
            <Button
              variant="glass"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              size="sm"
              onClick={() => void create()}
              disabled={!canSubmit}
            >
              Create
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
