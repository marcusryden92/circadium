"use client";

import { useEffect, useState } from "react";
import { media } from "@/lib/theme";

// Matches media.mobile (narrow viewport OR landscape phone) for the handful
// of places where the mobile treatment is a different interaction model, not
// just different styles (calendar view type, bottom sheets).
// Defaults to false so SSR renders the desktop markup; the post-mount effect
// corrects it before the surfaces that use this are interactive.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(media.mobile);
    setIsMobile(query.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
