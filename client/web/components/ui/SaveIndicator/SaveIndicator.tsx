"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { Save } from "lucide-react";
import type { RootState } from "@/redux/store";
import { useShellPortalTarget } from "@/components/ui/shell/ShellPortalContext";
import { circle } from "./SaveIndicator.css";

// Must match the saveFlash animation duration in SaveIndicator.css.ts.
const SAVE_FLASH_MS = 1600;

// Transient "saved to the database" pulse, bottom-right canvas corner —
// portaled into the shell canvas so the 15px offsets measure from the same
// frame as the sidebar's padding. Re-keyed on each successful sync so
// back-to-back saves restart the animation.
export function SaveIndicator() {
  const lastSavedAt = useSelector(
    (state: RootState) => state.syncStatus.lastSavedAt,
  );
  const target = useShellPortalTarget();
  const [shownFor, setShownFor] = useState<number | null>(null);

  useEffect(() => {
    if (lastSavedAt === null) return;
    setShownFor(lastSavedAt);
    const timer = window.setTimeout(() => setShownFor(null), SAVE_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [lastSavedAt]);

  if (shownFor === null || !target) return null;
  return createPortal(
    <div key={shownFor} className={circle} aria-hidden>
      <Save size={17} strokeWidth={2} />
    </div>,
    target,
  );
}
