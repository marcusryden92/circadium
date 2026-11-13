"use client";

import { useRef, type RefObject } from "react";
import { vars } from "@/lib/theme";
import {
  gsap,
  useGSAP,
  HOUSE_EASE,
  prefersReducedMotion,
  scrollerFor,
} from "../gsap";
import * as s from "./FeatureVignettes.css";

export type FeatureVignetteKind = "engine" | "travel" | "windows" | "goals";

const triggerFor = (root: Element) => ({
  trigger: root,
  scroller: scrollerFor(root),
  start: "top 78%",
  once: true,
});

function useVignette(
  ref: RefObject<HTMLDivElement | null>,
  build: (root: HTMLDivElement) => void,
) {
  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;
      build(root);
    },
    { scope: ref },
  );
}

type WeekBlock = { tone: s.Tone; h: number } | { spacer: number };

const WEEK: WeekBlock[][] = [
  [
    { tone: "blue", h: 52 },
    { spacer: 10 },
    { tone: "violet", h: 30 },
    { tone: "green", h: 24 },
  ],
  [
    { tone: "blue", h: 34 },
    { tone: "amber", h: 26 },
    { spacer: 18 },
    { tone: "teal", h: 40 },
  ],
  [
    { spacer: 8 },
    { tone: "violet", h: 46 },
    { tone: "blue", h: 24 },
    { spacer: 12 },
    { tone: "green", h: 22 },
  ],
  [
    { tone: "amber", h: 30 },
    { spacer: 14 },
    { tone: "blue", h: 56 },
    { tone: "rose", h: 20 },
  ],
  [
    { tone: "teal", h: 26 },
    { tone: "violet", h: 22 },
    { spacer: 16 },
    { tone: "blue", h: 38 },
  ],
];

// The week fills in day by day — the engine placing blocks.
function WeekGridVignette() {
  const ref = useRef<HTMLDivElement>(null);
  useVignette(ref, (root) => {
    gsap.from(root.querySelectorAll("[data-v='block']"), {
      autoAlpha: 0,
      y: 8,
      scaleY: 0.6,
      transformOrigin: "top center",
      duration: 0.7,
      ease: HOUSE_EASE,
      stagger: 0.05,
      scrollTrigger: triggerFor(root),
    });
  });

  return (
    <div ref={ref} className={s.stage} aria-hidden>
      <div className={s.weekDays}>
        {["M", "T", "W", "T", "F"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className={s.weekCols}>
        {WEEK.map((col, i) => (
          <div key={i} className={s.weekCol}>
            {col.map((b, j) =>
              "spacer" in b ? (
                <div key={j} style={{ height: b.spacer }} />
              ) : (
                <div
                  key={j}
                  data-v="block"
                  className={`${s.block} ${s.blockTones[b.tone]}`}
                  style={{ height: b.h }}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const TRAVEL_CHIPS = [
  { name: "Home", tone: vars.swatches.teal, left: "17.8%", top: "77.4%" },
  { name: "Studio", tone: vars.swatches.blue, left: "51.7%", top: "25.2%" },
  { name: "Gym", tone: vars.swatches.green, left: "83.3%", top: "73%" },
];

// Places appear, then the routes trace between them left to right (a clip
// wipe — the paths are dashed, so a dashoffset draw would eat the pattern),
// then the travel times settle in.
function TravelVignette() {
  const ref = useRef<HTMLDivElement>(null);
  useVignette(ref, (root) => {
    const svg = root.querySelector("svg");
    if (!svg) return;
    gsap
      .timeline({
        defaults: { ease: HOUSE_EASE },
        scrollTrigger: triggerFor(root),
      })
      .from(root.querySelectorAll("[data-v='chip']"), {
        autoAlpha: 0,
        y: 8,
        duration: 0.55,
        stagger: 0.12,
      })
      .fromTo(
        svg,
        { clipPath: "inset(-5% 105% -5% -5%)" },
        {
          clipPath: "inset(-5% -5% -5% -5%)",
          duration: 1.1,
          ease: "power2.inOut",
        },
        0.4,
      )
      .from(
        root.querySelectorAll("[data-v='time']"),
        { autoAlpha: 0, duration: 0.5, stagger: 0.15, immediateRender: true },
        1.0,
      );
  });

  return (
    <div ref={ref} className={s.stage} aria-hidden>
      <div className={s.travelStage}>
        <svg
          className={s.travelSvg}
          viewBox="0 0 360 230"
          preserveAspectRatio="none"
        >
          <path d="M 64 178 C 92 122, 132 80, 186 58" />
          <path d="M 186 58 C 234 86, 278 130, 300 168" />
        </svg>
        {TRAVEL_CHIPS.map((c) => (
          <span
            key={c.name}
            data-v="chip"
            className={s.travelChip}
            style={{ left: c.left, top: c.top }}
          >
            <i className={s.travelDot} style={{ background: c.tone }} />
            {c.name}
          </span>
        ))}
        <span
          data-v="time"
          className={s.travelTime}
          style={{ left: "31%", top: "50%" }}
        >
          25 min
        </span>
        <span
          data-v="time"
          className={s.travelTime}
          style={{ left: "72%", top: "46%" }}
        >
          18 min
        </span>
      </div>
    </div>
  );
}

type WindowBand = { tone: s.Tone; top: string; h: string; event?: boolean };

const WINDOW_COLUMNS: WindowBand[][] = [
  [{ tone: "blue", top: "3%", h: "42%", event: true }],
  [
    { tone: "blue", top: "3%", h: "26%" },
    { tone: "amber", top: "58%", h: "39%", event: true },
  ],
  [{ tone: "amber", top: "50%", h: "47%" }],
];

const RULER_HOURS = [
  { label: "9", top: "3%" },
  { label: "12", top: "35%" },
  { label: "15", top: "66%" },
  { label: "18", top: "97%" },
];

// The windows unfurl from their start times, then events land inside them.
function WindowsVignette() {
  const ref = useRef<HTMLDivElement>(null);
  useVignette(ref, (root) => {
    gsap
      .timeline({
        defaults: { ease: HOUSE_EASE },
        scrollTrigger: triggerFor(root),
      })
      .from(root.querySelectorAll("[data-v='band']"), {
        autoAlpha: 0,
        scaleY: 0,
        transformOrigin: "top center",
        duration: 0.8,
        stagger: 0.12,
      })
      .from(
        root.querySelectorAll("[data-v='event']"),
        {
          autoAlpha: 0,
          y: 8,
          duration: 0.5,
          stagger: 0.15,
          immediateRender: true,
        },
        0.7,
      );
  });

  return (
    <div ref={ref} className={s.stage} aria-hidden>
      <div className={s.windowsGrid}>
        <div className={s.windowsRuler}>
          {RULER_HOURS.map((h) => (
            <span
              key={h.label}
              className={s.windowsHour}
              style={{ top: h.top }}
            >
              {h.label}
            </span>
          ))}
        </div>
        {WINDOW_COLUMNS.map((col, i) => (
          <div key={i} className={s.windowsCol}>
            {col.map((band, j) => (
              <div
                key={j}
                data-v="band"
                className={`${s.windowBand} ${s.bandTones[band.tone]}`}
                style={{ top: band.top, height: band.h }}
              >
                {band.event ? (
                  <div
                    data-v="event"
                    className={`${s.block} ${s.windowEventTones[band.tone]} ${s.windowEvent}`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// The tree writes itself top-down, then the finished step gets its check.
function GoalTreeVignette() {
  const ref = useRef<HTMLDivElement>(null);
  useVignette(ref, (root) => {
    gsap
      .timeline({
        defaults: { ease: HOUSE_EASE },
        scrollTrigger: triggerFor(root),
      })
      .from(root.querySelectorAll("[data-v='row']"), {
        autoAlpha: 0,
        x: -10,
        duration: 0.6,
        stagger: 0.09,
      })
      .from(
        root.querySelector("[data-v='done']"),
        { scale: 0.3, duration: 0.45, immediateRender: true },
        0.75,
      );
  });

  return (
    <div ref={ref} className={s.stage} aria-hidden>
      <div data-v="row" className={s.goalRoot}>
        <span className={s.goalRootTitle}>Run a marathon</span>
        <span className={s.goalChip}>Goal</span>
      </div>
      <div className={s.goalChildren}>
        <div data-v="row" className={s.goalRow}>
          <span data-v="done" className={`${s.goalDot} ${s.goalDotDone}`} />
          <span className={`${s.goalText} ${s.goalTextDone}`}>
            Buy running shoes
          </span>
        </div>
        <div data-v="row" className={s.goalRow}>
          <span className={s.goalDot} />
          <span className={s.goalText}>Follow the 10-week plan</span>
        </div>
        <div className={s.goalChildren}>
          <div data-v="row" className={s.goalRow}>
            <span className={s.goalDot} />
            <span className={s.goalText}>Long run on Sundays</span>
          </div>
        </div>
        <div data-v="row" className={s.goalRow}>
          <span className={s.goalDot} />
          <span className={s.goalText}>Sign up for the race</span>
          <span className={s.goalDate}>Oct 12</span>
        </div>
      </div>
    </div>
  );
}

export function FeatureVignette({ kind }: { kind: FeatureVignetteKind }) {
  switch (kind) {
    case "engine":
      return <WeekGridVignette />;
    case "travel":
      return <TravelVignette />;
    case "windows":
      return <WindowsVignette />;
    case "goals":
      return <GoalTreeVignette />;
  }
}
