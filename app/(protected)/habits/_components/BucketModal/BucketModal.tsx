"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Trash2 } from "lucide-react";
import {
  Button,
  Caption,
  ConfirmModal,
  Input,
  categoryColor as resolveCategoryColor,
} from "@/components/ui";
import { PopoverColorPicker } from "@/components/events/PopoverColorPicker/PopoverColorPicker";
import {
  createHabitBucket,
  updateHabitBucket,
  deleteHabitBucket,
} from "@/actions/habits";
import {
  upsertHabitBucket,
  removeHabitBucket,
} from "@/redux/slices/habitsSlice";
import type { AppDispatch } from "@/redux/store";
import type { HabitBucket } from "@/types/prisma";
import {
  overlay,
  dialog,
  field,
  fieldLabel,
  footer,
  footerActions,
} from "./BucketModal.css";

// Create or edit a habit bucket — the habits surface's own grouping, separate
// from the item category tree. Deleting a bucket leaves its habits unsorted.
export function BucketModal({
  open,
  bucket,
  onOpenChange,
}: {
  open: boolean;
  /** Null creates a new bucket; a row edits it. */
  bucket: HabitBucket | null;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(bucket?.name ?? "");
      setColor(bucket?.color ?? null);
      setSaving(false);
      setConfirmDelete(false);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, bucket]);

  const canSubmit = name.trim().length > 0 && !saving;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const saved = bucket
        ? await updateHabitBucket({ bucketId: bucket.id, name: trimmed, color })
        : await createHabitBucket({ name: trimmed, color });
      dispatch(upsertHabitBucket(saved));
      onOpenChange(false);
    } catch {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!bucket) return;
    setConfirmDelete(false);
    void deleteHabitBucket({ bucketId: bucket.id })
      .then(() => {
        dispatch(removeHabitBucket({ bucketId: bucket.id }));
        onOpenChange(false);
      })
      .catch(() => {});
  };

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
            {bucket ? "Edit bucket" : "New bucket"}
          </Dialog.Title>
          <Caption>
            {bucket ? "edit bucket" : "new bucket · a shelf for your habits"}
          </Caption>

          <Input
            ref={inputRef}
            variant="underline"
            placeholder="Name this bucket"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void save();
              }
            }}
          />

          <div className={field}>
            <span className={fieldLabel}>Color</span>
            <PopoverColorPicker
              currentColor={resolveCategoryColor({ color })}
              onChange={setColor}
            />
          </div>

          <div className={footer}>
            {bucket ? (
              <Button
                variant="glass"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} strokeWidth={2} /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className={footerActions}>
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
                onClick={() => void save()}
                disabled={!canSubmit}
              >
                {bucket ? "Save" : "Create"}
              </Button>
            </div>
          </div>

          <ConfirmModal
            open={confirmDelete}
            title={`Delete "${bucket?.name ?? ""}"?`}
            body="Habits in this bucket are kept — they just become unsorted."
            confirmLabel="Delete"
            tone="danger"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={onDelete}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
