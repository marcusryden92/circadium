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

type ShellOverlayContextValue = {
  overlayOpen: boolean;
  registerOverlay: () => () => void;
};

const ShellOverlayContext = createContext<ShellOverlayContextValue | null>(null);

// Tracks whether any full-screen shell surface (the AI assistant, the
// WeekStructureModal) is open, so chrome that would otherwise float on top of
// them on mobile — the MobileTabs floating menu — can step out of the way. A
// counter, not a boolean, so overlapping overlays each hold it open and the
// last one to close restores the menu.
export function ShellOverlayProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const registerOverlay = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    () => ({ overlayOpen: count > 0, registerOverlay }),
    [count, registerOverlay],
  );

  return (
    <ShellOverlayContext.Provider value={value}>
      {children}
    </ShellOverlayContext.Provider>
  );
}

// Declares "a shell overlay is open" while `active` is true. Registers on the
// way in and releases on the way out (or unmount), so a surface that unmounts
// while open never leaves the menu stuck hidden.
export function useShellOverlay(active: boolean): void {
  const register = useContext(ShellOverlayContext)?.registerOverlay;
  useEffect(() => {
    if (!active || !register) return;
    return register();
  }, [active, register]);
}

export function useShellOverlayOpen(): boolean {
  return useContext(ShellOverlayContext)?.overlayOpen ?? false;
}
