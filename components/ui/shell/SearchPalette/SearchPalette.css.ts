import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { fieldLabel } from "@/lib/theme/typography.css";
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
    top: "12%",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    width: "min(640px, calc(100vw - 32px))",
    // Fixed height (not just a max) so the palette holds one size instead of
    // growing as results appear.
    height: "min(560px, calc(100vh - 24%))",
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
  padding: "14px 18px",
  borderBottom: `1px solid ${vars.rule}`,
});

export const inputIcon = style({
  display: "inline-flex",
  alignItems: "center",
  color: vars.inkSoft,
});

// Bare field inside the icon row; the large search font is the one thing that
// differs from the bare <Input> default, so it wins via the doubled selector.
export const input = style({
  flex: 1,
  selectors: {
    "&&": { fontSize: 16 },
  },
});

export const scrollArea = style({
  overflowY: "auto",
  flex: 1,
  minHeight: 0,
});

export const group = style({
  padding: "8px 0",
  selectors: {
    "&:not(:last-child)": {
      borderBottom: `1px solid ${vars.rule}`,
    },
  },
});

export const groupLabel = style([
  fieldLabel,
  {
    padding: "6px 18px",
  },
]);

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  padding: "9px 18px",
  cursor: "pointer",
  border: "none",
  background: "transparent",
  width: "100%",
  textAlign: "left",
  color: vars.ink,
  fontFamily: vars.font.ui,
  textDecoration: "none",
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
  },
});

export const itemActive = style({
  background: vars.glass.bgSoft,
});

export const itemIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  color: vars.inkSoft,
  flexShrink: 0,
});

export const itemBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  minWidth: 0,
  flex: 1,
});

export const itemTitle = style({
  fontSize: 13,
  fontWeight: 500,
  color: vars.ink,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const itemSub = style({
  fontSize: 11.5,
  color: vars.muted,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const emptyState = style({
  padding: "36px 18px",
  textAlign: "center",
  color: vars.muted,
  fontFamily: vars.font.ui,
  fontSize: 13,
});

export const footer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  padding: "8px 14px",
  borderTop: `1px solid ${vars.rule}`,
  background: vars.glass.bgSoft,
  fontFamily: vars.font.ui,
  fontSize: 11,
  color: vars.muted,
  flexWrap: "wrap",
  "@media": {
    [media.mobile]: {
      display: "none",
    },
  },
});

export const footerHints = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["4"],
  flexWrap: "wrap",
});
