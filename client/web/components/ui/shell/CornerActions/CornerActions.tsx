"use client";

import { usePathname } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { useSearch } from "../SearchContext";
import { useAssistant } from "../AssistantContext";
import { useShellOverlayOpen } from "../ShellOverlayContext";
import { isCanvasRoute } from "../nav";
import { searchButton, assistantButton } from "./CornerActions.css";

export function CornerActions() {
  const pathname = usePathname() ?? "";
  const { setOpen: setSearchOpen } = useSearch();
  const { openAssistant } = useAssistant();
  const overlayOpen = useShellOverlayOpen();

  // A full-screen shell surface (AI assistant, WeekStructureModal) is open —
  // step out of the way, same as the bottom floating menu. Canvas routes drop
  // the corner chrome entirely so the canvas keeps the space.
  if (overlayOpen || isCanvasRoute(pathname)) return null;

  return (
    <>
      <button
        type="button"
        className={searchButton}
        onClick={() => setSearchOpen(true)}
        title="Search (Ctrl/Cmd+K)"
        aria-label="Search"
      >
        <Search size={19} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className={assistantButton}
        onClick={() => openAssistant()}
        title="AI assistant (Ctrl/Cmd+I)"
        aria-label="AI assistant"
      >
        <Sparkles size={20} strokeWidth={2} aria-hidden />
      </button>
    </>
  );
}
