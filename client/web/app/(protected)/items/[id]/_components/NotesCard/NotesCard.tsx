"use client";

import { useEffect, useState } from "react";
import { useItem } from "../ItemContext";
import { card, cardTitle, notesInput } from "./NotesCard.css";

// Free typing, commit on blur — writing per keystroke would run the sync
// debounce and an engine regen for every character.
export function NotesCard() {
  const { item, updateField } = useItem();
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [item.id]);

  const commit = () => {
    if (draft === null) return;
    updateField("notes", draft.trim() ? draft : null);
    setDraft(null);
  };

  return (
    <div className={card}>
      <div className={cardTitle}>Notes</div>
      <textarea
        className={notesInput}
        value={draft ?? item.notes ?? ""}
        placeholder="Anything worth keeping with this item…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={4}
        aria-label="Notes"
      />
    </div>
  );
}
