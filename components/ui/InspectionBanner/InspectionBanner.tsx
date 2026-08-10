"use client";

import { useEffect, useState } from "react";
import { exitInspection } from "@/utils/inspection";
import { banner, label, exitButton } from "./InspectionBanner.css";

// Shown while snapshot impersonation is active. Mounted only after the client
// has committed (the target lives in sessionStorage, which the server render
// can't see — rendering it during hydration would mismatch).
export function InspectionBanner({ targetLabel }: { targetLabel: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className={banner} role="status">
      <span className={label}>
        Inspecting {targetLabel} — read-only, nothing saves
      </span>
      <button type="button" className={exitButton} onClick={exitInspection}>
        Exit
      </button>
    </div>
  );
}
