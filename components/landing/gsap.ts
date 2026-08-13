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

// The landing page scrolls inside <main> (overflowY: auto), not the window —
// ScrollTrigger's default scroller would never fire. Every trigger must pass
// the real scroll container.
export function scrollerFor(el: Element): Element | Window {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return window;
}

export { gsap, ScrollTrigger, useGSAP };
