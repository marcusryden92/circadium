"use client";

import { useRef, type ReactNode } from "react";
import {
  gsap,
  useGSAP,
  HOUSE_EASE,
  prefersReducedMotion,
  scrollerFor,
} from "../gsap";

interface CascadeProps {
  children: ReactNode;
  className?: string;
  /** Play immediately on mount instead of when scrolled into view. */
  onMount?: boolean;
}

// Staggers descendants marked [data-cascade] (falling back to direct
// children) into place. Server markup and reduced-motion users get the
// resting state untouched.
export function Cascade({
  children,
  className,
  onMount = false,
}: CascadeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;
      const marked = root.querySelectorAll("[data-cascade]");
      const targets = marked.length
        ? Array.from(marked)
        : Array.from(root.children);
      if (!targets.length) return;
      gsap.from(targets, {
        autoAlpha: 0,
        y: 22,
        duration: 1.1,
        ease: HOUSE_EASE,
        stagger: 0.09,
        clearProps: "opacity,visibility,transform",
        delay: onMount ? 0.15 : 0,
        scrollTrigger: onMount
          ? undefined
          : {
              trigger: root,
              scroller: scrollerFor(root),
              start: "top 82%",
              once: true,
            },
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
