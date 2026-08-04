import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media, zIndex } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// On mobile the floating menu steps aside while the bar is up (the bar's
// useShellOverlay registration), so the bar takes the menu's spot at the
// bottom instead of stacking above it. Buttons collapse to icons in portrait
// (btnLabel below); the wide-but-short landscape phone has room for labels.
export const bar = style({
  position: "fixed",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: zIndex.floating,
  display: "flex",
  alignItems: "center",
  gap: space["1"],
  padding: "8px 12px",
  borderRadius: radii["pill"],
  background: vars.ink,
  color: vars.paper,
  boxShadow: vars.shadow.panel,
  fontFamily: vars.font.ui,
  transition: themeTransition,
  maxWidth: "calc(100vw - 24px)",
  "@media": {
    [media.mobile]: {
      bottom: 12,
      padding: "8px 10px",
    },
  },
});

// Portrait mobile: icon-only pills would be ~25px tall at the recipe's sm
// padding — pad them up to a real tap target. Landscape phones get labels
// back but stay touch-sized, just slightly shorter to respect the short
// viewport. Popover contents render in a portal, so this can't leak into
// the menus.
globalStyle(`${bar} button`, {
  "@media": {
    [media.mobile]: {
      padding: "9px 11px",
    },
    [media.landscapePhone]: {
      padding: "7px 13px",
    },
  },
});

// Button text, hidden in portrait mobile where all five actions won't fit a
// single row with labels. Landscape phones are ~800px wide — labels return.
export const btnLabel = style({
  "@media": {
    [media.mobile]: {
      display: "none",
    },
    [media.landscapePhone]: {
      display: "inline",
    },
  },
});

export const countLabel = style([
  text.bodySm,
  {
    fontWeight: 600,
    whiteSpace: "nowrap",
    padding: "0 6px",
  },
]);

export const barDivider = style({
  width: 1,
  alignSelf: "stretch",
  margin: "4px 4px",
  background: `color-mix(in srgb, ${vars.paper} 25%, transparent)`,
});

// The bar surface is vars.ink, so the glass pillBtn's currentColor tinting
// must run off paper, not the recipe's default ink.
export const barBtn = style({
  color: vars.paper,
  whiteSpace: "nowrap",
});

export const escHint = style([
  text.label,
  {
    color: `color-mix(in srgb, ${vars.paper} 60%, transparent)`,
    whiteSpace: "nowrap",
    padding: "0 6px",
    "@media": {
      [media.mobile]: {
        display: "none",
      },
    },
  },
]);

export const menu = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  maxHeight: 280,
  overflowY: "auto",
  minWidth: 190,
});

export const menuItem = style([
  text.body,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    padding: "6px 8px",
    border: "none",
    borderRadius: radii["xs"],
    background: "transparent",
    color: vars.ink,
    textAlign: "left",
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
      },
    },
  },
]);

export const menuItemMuted = style({
  color: vars.muted,
});

export const priorityPopup = style({
  padding: space["2.5"],
});

// Mirrors the item-detail PrioritySection pills so priority reads the same
// everywhere it's picked.
export const priorityRow = style({
  display: "flex",
  gap: space["1.5"],
});

export const priorityPill = style([
  text.bodySm,
  {
    width: 28,
    height: 28,
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${vars.glass.stroke}`,
    borderRadius: radii["pill"],
    background: "transparent",
    color: vars.inkSoft,
    cursor: "pointer",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
    selectors: {
      "&:hover": { background: vars.glass.bgSoft, borderColor: vars.rule },
      '&[aria-pressed="true"]': {
        background: vars.ink,
        color: vars.paper,
        borderColor: vars.ink,
      },
      '&[aria-pressed="true"]:hover': {
        background: vars.inkSoft,
        borderColor: vars.inkSoft,
      },
    },
  },
]);
