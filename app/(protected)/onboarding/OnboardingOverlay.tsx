"use client";

import { useCallback, useEffect, useState } from "react";
import { Grain } from "@/components/ui";
import { OnboardingFlow } from "./OnboardingFlow";
import { overlayRoot, overlayScroll } from "./onboarding.css";

// The shell's global palette shortcuts (assistant mod+I, capture mod+J,
// search mod+K) stay registered while the overlay covers the app; swallowing
// them here (capture phase beats the providers' bubble-phase window
// listeners) keeps a palette or a second assistant from opening over the
// setup flow.
const SUPPRESSED_SHORTCUT_KEYS = new Set(["i", "j", "k"]);
// Calendar undo/redo (mod+Z / mod+Y) only stops propagation — the app-level
// undo must not fire mid-onboarding, but preventDefault would also kill
// native text undo inside the flow's inputs.
const PROPAGATION_ONLY_KEYS = new Set(["z", "y"]);

// Rendered in the shell's overlay slot. Its initial visibility is resolved on
// the server (the protected layout reads onboardedAt), so on a fresh load the
// overlay is either present or absent from the first paint — no flash of the
// dashboard before it appears. Completing (or skipping) hides it in place; no
// navigation, no route, so nothing beneath needs to know onboarding exists.
export function OnboardingOverlay({
  initialNeedsOnboarding,
}: {
  initialNeedsOnboarding: boolean;
}) {
  const [show, setShow] = useState(initialNeedsOnboarding);

  const handleComplete = useCallback(() => setShow(false), []);

  useEffect(() => {
    if (!show) return;
    const suppress = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (SUPPRESSED_SHORTCUT_KEYS.has(key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (PROPAGATION_ONLY_KEYS.has(key)) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", suppress, true);
    return () => window.removeEventListener("keydown", suppress, true);
  }, [show]);

  if (!show) return null;

  return (
    <div className={overlayRoot}>
      <Grain />
      <div className={overlayScroll}>
        <OnboardingFlow onComplete={handleComplete} />
      </div>
    </div>
  );
}
