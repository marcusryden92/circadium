import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
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
  zIndex: 100,
  animationName: fadeIn,
  animationDuration: `${DURATIONS.modal}s`,
  animationTimingFunction: "ease",
});

export const dialog = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: 101,
    top: "14%",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    width: "min(560px, calc(100vw - 32px))",
    maxHeight: "min(480px, calc(100vh - 28%))",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animationName: slideUp,
    animationDuration: `${DURATIONS.modal}s`,
    animationTimingFunction: "ease",
  },
]);

export const inputRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  padding: "12px 16px",
  borderBottom: `1px solid ${vars.rule}`,
});

export const inputIcon = style({
  display: "inline-flex",
  alignItems: "center",
  color: vars.inkSoft,
});

export const input = style({
  flex: 1,
  selectors: {
    "&&": { fontSize: 15 },
  },
});

export const scrollArea = style({
  overflowY: "auto",
  flex: 1,
  minHeight: 0,
  padding: "6px 0",
});

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  padding: "9px 16px",
  cursor: "pointer",
  border: "none",
  background: "transparent",
  width: "100%",
  textAlign: "left",
  color: vars.ink,
  fontFamily: vars.font.ui,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
  },
});

export const itemActive = style({
  background: vars.glass.bgSoft,
});

export const itemTitle = style({
  fontSize: 13,
  fontWeight: 500,
  color: vars.ink,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
});

export const itemDuration = style({
  fontSize: 11.5,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
});

export const emptyState = style({
  padding: "32px 16px",
  textAlign: "center",
  color: vars.muted,
  fontFamily: vars.font.ui,
  fontSize: 13,
});
