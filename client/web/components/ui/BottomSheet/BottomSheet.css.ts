import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { fieldLabel } from "@/lib/theme/typography.css";
import { backdropFilters } from "@/lib/theme/effects";
import { DURATIONS } from "@/lib/theme/transitions";

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const sheetUp = keyframes({
  from: { transform: "translateY(100%)" },
  to: { transform: "translateY(0)" },
});

// Destination-only: a swipe-dismiss leaves an inline translateY on the sheet,
// and the exit must animate from there, not snap back to 0 first.
const sheetDown = keyframes({
  to: { transform: "translateY(100%)" },
});

export const sheetOverlay = style({
  position: "fixed",
  inset: 0,
  background: vars.overlay,
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  zIndex: zIndex.palette,
  animationDuration: `${DURATIONS.modal}s`,
  animationTimingFunction: "ease",
  selectors: {
    '&[data-state="open"]': { animationName: fadeIn },
    '&[data-state="closed"]': { animationName: fadeOut },
  },
});

export const sheet = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: zIndex.palette + 1,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    gap: space["0.5"],
    maxHeight: ["85vh", "85dvh"],
    padding: `${space["2"]}px ${space["3"]}px`,
    paddingBottom: `calc(${space["5"]}px + env(safe-area-inset-bottom, 0px))`,
    borderRadius: `${radii["xl+2"]}px ${radii["xl+2"]}px 0 0`,
    animationDuration: `${DURATIONS.modal}s`,
    animationTimingFunction: "ease",
    selectors: {
      '&[data-state="open"]': { animationName: sheetUp },
      '&[data-state="closed"]': { animationName: sheetDown },
    },
  },
]);

export const sheetFlush = style({
  paddingLeft: 0,
  paddingRight: 0,
});

// Full-width strip so the drag affordance is a real touch target, not the
// 4px pill alone; touchAction none keeps the browser from claiming the swipe.
export const sheetHandle = style({
  flexShrink: 0,
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 20,
  touchAction: "none",
  cursor: "grab",
  "::before": {
    content: '""',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    background: vars.rule,
  },
});

export const sheetTitle = style([
  fieldLabel,
  {
    flexShrink: 0,
    color: vars.muted,
    padding: `0 ${space["2"]}px ${space["1"]}px`,
    touchAction: "none",
  },
]);

// Content taller than the sheet's 85dvh cap (short landscape-phone viewports)
// scrolls here instead of clipping; keeps the same row gap the sheet used to
// apply to direct children.
export const sheetBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
});

