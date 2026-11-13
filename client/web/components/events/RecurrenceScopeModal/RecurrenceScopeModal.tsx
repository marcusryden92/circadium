"use client";

import { Button, ConfirmModal } from "@/components/ui";

interface RecurrenceScopeModalProps {
  open: boolean;
  mode: "move" | "delete" | "resize";
  planTitle: string;
  // The recurring entity's noun, used in the title/body copy. Defaults to
  // "plan"; templates pass "template".
  entityLabel?: string;
  onThisOccurrence: () => void;
  onAllOccurrences: () => void;
  onCancel: () => void;
}

export function RecurrenceScopeModal({
  open,
  mode,
  planTitle,
  entityLabel = "plan",
  onThisOccurrence,
  onAllOccurrences,
  onCancel,
}: RecurrenceScopeModalProps) {
  const isDelete = mode === "delete";
  const verb = isDelete ? "Delete" : mode === "resize" ? "Resize" : "Move";
  return (
    <ConfirmModal
      open={open}
      title={`${verb} recurring ${entityLabel}`}
      body={`"${planTitle}" repeats. ${verb} just this occurrence, or every occurrence?`}
      confirmLabel="Just this occurrence"
      cancelLabel="Cancel"
      tone={isDelete ? "danger" : "default"}
      onCancel={onCancel}
      onConfirm={onThisOccurrence}
      extraActions={
        <Button variant="glass" size="sm" onClick={onAllOccurrences}>
          Every occurrence
        </Button>
      }
    />
  );
}
