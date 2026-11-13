"use client";

import { useRef } from "react";
import {
  gsap,
  useGSAP,
  HOUSE_EASE,
  prefersReducedMotion,
  scrollerFor,
} from "../gsap";
import * as s from "./ReflowDemo.css";

const HOURS = [
  { label: "9:00", top: 0 },
  { label: "11:00", top: 80 },
  { label: "13:00", top: 160 },
  { label: "15:00", top: 240 },
];

// Plays once when scrolled into view: the meeting lands on top of Writing,
// a beat passes, and the week re-sorts — then stays resolved. The CSS base
// state is the pre-reflow day (meeting and chip hidden), so without JS the
// card is still a plausible static calendar.
export function ReflowDemo() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const chip = root.querySelector("[data-reflow='chip']");
      const meeting = root.querySelector("[data-reflow='meeting']");
      const writing = root.querySelector("[data-reflow='writing']");
      if (!chip || !meeting || !writing) return;

      if (prefersReducedMotion()) {
        gsap.set([chip, meeting], { autoAlpha: 1 });
        gsap.set(writing, { y: 40 });
        return;
      }

      gsap.set(chip, { y: -6 });
      gsap.set(meeting, { y: -14 });

      gsap
        .timeline({
          defaults: { ease: HOUSE_EASE },
          scrollTrigger: {
            trigger: root,
            scroller: scrollerFor(root),
            start: "top 78%",
            once: true,
          },
        })
        .from(root, { autoAlpha: 0, y: 20, duration: 0.9 })
        .to(chip, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.8)
        .to(meeting, { autoAlpha: 1, y: 0, duration: 0.55 }, 1.2)
        .to(writing, { y: 40, duration: 0.85 }, 2.0);
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className={s.card} aria-hidden>
      <div className={s.header}>
        <span className={s.day}>Tuesday</span>
        <span className={s.chip} data-reflow="chip">
          Meeting added
        </span>
      </div>
      <div className={s.canvas}>
        {HOURS.map((h) => (
          <span key={h.label} className={s.hour} style={{ top: h.top }}>
            {h.label}
          </span>
        ))}
        <div className={s.blockDeep}>Deep work</div>
        <div className={s.blockMeeting} data-reflow="meeting">
          Meeting
        </div>
        <div className={s.blockWriting} data-reflow="writing">
          Writing
        </div>
        <div className={s.blockGym}>Gym</div>
      </div>
    </div>
  );
}
