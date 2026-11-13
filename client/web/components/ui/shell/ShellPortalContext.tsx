"use client";

import { createContext, useContext, type ReactNode } from "react";

// The AppShell canvas element — the portal target for full-canvas overlays
// (AI assistant, WeekStructureModal). Mounting there lets an overlay cover
// the sidebar and mobile tabs while staying inside the shell's rounded frame
// and bezel, instead of a viewport-fixed layer that paints over them.
const ShellPortalContext = createContext<HTMLElement | null>(null);

export function ShellPortalProvider({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <ShellPortalContext.Provider value={target}>
      {children}
    </ShellPortalContext.Provider>
  );
}

export function useShellPortalTarget(): HTMLElement | null {
  return useContext(ShellPortalContext);
}
