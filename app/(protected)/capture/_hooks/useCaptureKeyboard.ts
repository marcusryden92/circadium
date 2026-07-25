import { useEffect } from "react";
import type { Planner } from "@/types/prisma";
import type { TriageType } from "../_constants";

// Global keyboard handlers for the triage flow. Suppressed when focus is in
// an input/textarea/select (lets the user type freely) and when the event
// originates inside the category picker (so its own arrow/Enter navigation
// wins over the queue's). Escape inside an input blurs it.
//
// typeCursor: 0..typeKeys.length-1 selects a type from typeKeys; the trailing
// slot (typeCursor === typeKeys.length) is the trash button. Left/Right cycle
// across all slots; Enter trashes on the trash slot, saves otherwise.
export function useCaptureKeyboard({
  paused = false,
  selected,
  queue,
  setSelectedId,
  setDraftType,
  commitSelected,
  trashSelected,
  typeCursor,
  setTypeCursor,
  typeKeys,
}: {
  paused?: boolean;
  selected: Planner | null;
  queue: Planner[];
  setSelectedId: (id: string | null) => void;
  setDraftType: (type: TriageType) => void;
  commitSelected: (markReady: boolean) => void;
  trashSelected: () => void;
  typeCursor: number;
  setTypeCursor: (n: number) => void;
  typeKeys: ReadonlyArray<TriageType>;
}) {
  useEffect(() => {
    if (!selected || paused) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") (target as HTMLElement).blur();
        return;
      }
      if (target?.closest("[data-capture-picker]")) return;
      if (e.key === "1") {
        setDraftType("task");
      } else if (e.key === "2") {
        setDraftType("plan");
      } else if (e.key === "3") {
        setDraftType("goal");
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        trashSelected();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (typeCursor === typeKeys.length) {
          trashSelected();
        } else {
          commitSelected(true);
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (queue.length < 2) return;
        e.preventDefault();
        const idx = queue.findIndex((q) => q.id === selected.id);
        if (idx === -1) return;
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const nextIdx = (idx + delta + queue.length) % queue.length;
        setSelectedId(queue[nextIdx].id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const total = typeKeys.length + 1;
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const next = (typeCursor + delta + total) % total;
        setTypeCursor(next);
        if (next < typeKeys.length) {
          setDraftType(typeKeys[next]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    paused,
    selected,
    queue,
    setSelectedId,
    setDraftType,
    commitSelected,
    trashSelected,
    typeCursor,
    setTypeCursor,
    typeKeys,
  ]);
}
