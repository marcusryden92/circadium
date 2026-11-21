"use client";

import { useEffect, useState } from "react";

type Platform = "mac" | "other";

// userAgentData.platform is Chromium-only; Safari + Firefox still need the
// deprecated navigator.platform fallback. Either string is "MacIntel"/"iPhone"
// etc. on Apple devices and "Win32"/"Linux x86_64" elsewhere.
function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const p = ua.userAgentData?.platform ?? navigator.platform ?? "";
  return /Mac|iPod|iPhone|iPad/i.test(p);
}

export function usePlatform(): {
  platform: Platform;
  isMac: boolean;
  modKey: string;
  modKeyLabel: string;
  altKey: string;
} {
  // Default to non-Mac so SSR renders Ctrl; the post-mount effect swaps to ⌘
  // on Apple devices. A brief flash is preferable to a hydration mismatch.
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(detectIsMac());
  }, []);

  return {
    platform: isMac ? "mac" : "other",
    isMac,
    modKey: isMac ? "⌘" : "Ctrl",
    modKeyLabel: isMac ? "Command" : "Control",
    altKey: isMac ? "⌥" : "Alt",
  };
}
