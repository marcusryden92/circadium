"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Grain } from "../../Grain";
import { useTheme } from "../../ThemeProvider";
import { Sidebar } from "../Sidebar";
import { MobileTabs } from "../MobileTabs";
import { CaptureProvider } from "../CaptureContext";
import { CapturePalette } from "../CapturePalette";
import { SearchProvider } from "../SearchContext";
import { SearchPalette } from "../SearchPalette";
import { CornerActions } from "../CornerActions";
import { ShellOverlayProvider } from "../ShellOverlayContext";
import { NavHistoryProvider } from "../NavHistoryContext";
import { ShellPortalProvider } from "../ShellPortalContext";
import {
  bezelFrame,
  canvas,
  contentRow,
  mainColumn,
  desktopOnly,
  mobileOnly,
} from "./AppShell.css";

type Props = {
  children: ReactNode;
  userName?: string;
  userInitial?: string;
  // Rendered as a canvas child after the content row — the mount point for
  // the global AI assistant, which covers the sidebar and mobile tabs while
  // clipping to the shell rounding. Passed in as a slot so the shell never
  // imports draft code (avoids an AppShell -> draft -> ui-barrel -> AppShell
  // cycle).
  assistantSlot?: ReactNode;
  // Rendered as the last child of the canvas — a full-canvas overlay that
  // clips to the shell rounding and covers the sidebar (onboarding). Same
  // slot rationale as assistantSlot.
  overlaySlot?: ReactNode;
  // Rendered after overlaySlot as the topmost canvas child — the first-run
  // data-load screen. Sits above everything and clips to the shell rounding.
  loadingSlot?: ReactNode;
};

export function AppShell({
  children,
  userName,
  userInitial,
  assistantSlot,
  overlaySlot,
  loadingSlot,
}: Props) {
  const { toggle: toggleTheme } = useTheme();
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  return (
    <CaptureProvider>
      <SearchProvider>
        <ShellOverlayProvider>
          <NavHistoryProvider>
            <ShellPortalProvider target={canvasEl}>
              <div className={bezelFrame}>
                <div className={canvas} ref={setCanvasEl}>
                  <Grain />
                  <div className={contentRow}>
                    <div className={desktopOnly}>
                      <Sidebar userName={userName} userInitial={userInitial} />
                    </div>
                    <div className={mainColumn}>
                      <CornerActions />
                      {children}
                    </div>
                  </div>
                  <div className={mobileOnly}>
                    <MobileTabs />
                  </div>
                  {assistantSlot}
                  <CapturePalette />
                  <SearchPalette />
                  {overlaySlot}
                  {loadingSlot}
                </div>
              </div>
            </ShellPortalProvider>
          </NavHistoryProvider>
        </ShellOverlayProvider>
      </SearchProvider>
    </CaptureProvider>
  );
}
