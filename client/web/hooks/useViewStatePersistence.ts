"use client";

import { useEffect, useRef, useState } from "react";
import {
  getViewState,
  saveViewState,
  type ViewStateKind,
} from "@/actions/viewState";

// Load-once + debounced-save for a canvas page's serialized view state
// (graph / mindmap). The caller passes the JSON snapshot of its current
// state and an applier for a previously saved blob. Saves start only after
// the load settles, and the first post-load snapshot is recorded without
// writing, so mount defaults never clobber the stored state.
export function useViewStatePersistence(
  kind: ViewStateKind,
  snapshot: string,
  applySaved: (raw: string) => void,
): { hydrated: boolean } {
  const [hydrated, setHydrated] = useState(false);
  const lastSavedRef = useRef<string | null>(null);
  const applyRef = useRef(applySaved);
  applyRef.current = applySaved;

  useEffect(() => {
    let alive = true;
    getViewState()
      .then((states) => {
        if (!alive) return;
        const raw = states[kind];
        if (raw) applyRef.current(raw);
        setHydrated(true);
      })
      .catch(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  useEffect(() => {
    if (!hydrated) return;
    if (lastSavedRef.current === null) {
      lastSavedRef.current = snapshot;
      return;
    }
    if (snapshot === lastSavedRef.current) return;
    const timeout = setTimeout(() => {
      lastSavedRef.current = snapshot;
      void saveViewState(kind, snapshot).catch(() => {});
    }, 800);
    return () => clearTimeout(timeout);
  }, [kind, snapshot, hydrated]);

  return { hydrated };
}
