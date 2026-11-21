import { useState } from "react";

export type FlashTone = "success" | "info";

type FlashState = { id: string; tone: FlashTone } | null;

// Briefly tints a row before running an action so the user gets visible
// confirmation that the click registered. The default 500ms window matches
// the dashboard's Complete/Postpone affordance — long enough to be felt,
// short enough not to feel laggy. Re-clicking the same row while it's
// already flashing is a no-op so a fast double-click doesn't double-fire.
export function useFlashAction(durationMs = 500) {
  const [flash, setFlash] = useState<FlashState>(null);

  const run = (id: string, tone: FlashTone, action: () => void) => {
    if (flash?.id === id) return;
    setFlash({ id, tone });
    window.setTimeout(() => {
      setFlash(null);
      action();
    }, durationMs);
  };

  const toneFor = (id: string): FlashTone | null =>
    flash?.id === id ? flash.tone : null;

  return { run, toneFor };
}
