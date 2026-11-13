import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { text } from "@/lib/theme/typography.css";
import { backdropFilters } from "@/lib/theme/effects";
import { DURATIONS } from "@/lib/theme/transitions";

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const slideUp = keyframes({
  from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

export const overlay = style({
  position: "fixed",
  inset: 0,
  background: vars.overlay,
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  zIndex: 50,
  animationName: fadeIn,
  animationDuration: `${DURATIONS.modal}s`,
  animationTimingFunction: "ease",
});

export const dialog = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: 51,
    top: "20%",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    width: "min(520px, calc(100vw - 32px))",
    padding: "18px 20px 20px",
    display: "flex",
    flexDirection: "column",
    gap: space["4"],
    animationName: slideUp,
    animationDuration: `${DURATIONS.modal}s`,
    animationTimingFunction: "ease",
  },
]);

// Mobile-sheet body: the shared BottomSheet owns the surface; this restores
// the stack rhythm the desktop dialog gets from its own padding + gap.
export const sheetStack = style({
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
  paddingTop: space["1"],
});

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const fieldLabel = style([
  text.bodySm,
  {
    fontWeight: 600,
    letterSpacing: "0.01em",
    color: vars.muted,
  },
]);

export const footer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: space["3"],
  flexWrap: "wrap",
});
