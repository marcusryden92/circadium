import { useEffect, useRef, useState } from "react";

interface UseInlineEditArgs {
  // The committed value. When this changes (e.g. selecting a different
  // record) the draft is reset and any active edit is cancelled.
  value: string;
  resetKey: string;
  onCommit: (next: string) => void;
}

export function useInlineEdit({ value, resetKey, onCommit }: UseInlineEditArgs) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
    setEditing(false);
  }, [resetKey, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return {
    editing,
    draft,
    setDraft,
    inputRef,
    startEdit: () => setEditing(true),
    commit,
    cancel,
  };
}
