"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// How an entry point scopes the assistant session. All fields optional: a
// bare open (mod+I, sidebar button) resolves focus from the current route.
// `intent` is the programmatic hook for flows like onboarding ("onboarding")
// — carried through so the session can key a prompt preamble off it.
export type AssistantScope = {
  focusItemId?: string;
  initialPrompt?: string;
  intent?: string;
};

type AssistantContextValue = {
  open: boolean;
  scope: AssistantScope | null;
  openAssistant: (scope?: AssistantScope) => void;
  close: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<AssistantScope | null>(null);

  const openAssistant = useCallback((nextScope?: AssistantScope) => {
    setScope(nextScope ?? null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Clear the scope so a stale initialPrompt doesn't leak into the next
    // bare open.
    setScope(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setOpen((o) => {
          if (o) setScope(null);
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(
    () => ({ open, scope, openAssistant, close }),
    [open, scope, openAssistant, close],
  );
  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    return { open: false, scope: null, openAssistant: () => {}, close: () => {} };
  }
  return ctx;
}
