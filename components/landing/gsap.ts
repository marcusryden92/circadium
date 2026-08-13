"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Matches the cubic-bezier(0.22, 1, 0.36, 1) the landing page's CSS motion
// used — one ease vocabulary across old and new animation.
export const HOUSE_EASE = "power4.out";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, ScrollTrigger, useGSAP };
