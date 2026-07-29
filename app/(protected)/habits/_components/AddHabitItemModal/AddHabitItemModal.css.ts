import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
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
    top: "14%",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    width: "min(480px, calc(100vw - 32px))",
    padding: "18px 20px 20px",
    display: "flex",
    flexDirection: "column",
    gap: space["3"],
    animationName: slideUp,
    animationDuration: `${DURATIONS.modal}s`,
    animationTimingFunction: "ease",
  },
]);

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  maxHeight: 320,
  overflowY: "auto",
  scrollbarGutter: "stable",
});

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: `${space["1.5"]} ${space["2"]}`,
  borderRadius: radii.sm,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  transition: "background 0.12s",
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const rowTitle = style({
  flex: 1,
  minWidth: 0,
  fontFamily: vars.font.ui,
  fontSize: 13,
  color: vars.ink,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const emptyState = style({
  padding: space["6"],
  textAlign: "center",
});
