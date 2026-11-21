"use client";

import { useEffect, useState } from "react";
import { media } from "@/lib/theme";

// Touch-primary device (no hover, coarse pointer), regardless of viewport
// width or orientation — a phone in landscape is wider than the mobile
// breakpoint but still needs the touch interaction model. Defaults to false
// so SSR renders the desktop markup; the post-mount effect corrects it.
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(media.touch);
    setCoarse(query.matches);
    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return coarse;
}
