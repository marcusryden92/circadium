import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media } from "@/lib/theme/scales";
import { fieldLabel, text } from "@/lib/theme/typography.css";
import { backdropFilters } from "@/lib/theme/effects";
import { buttonTransition, themeTransition } from "@/lib/theme/transitions";

export const tabBar = style({
  position: "fixed",
  right: space["1"],
  left: space["1"],
  bottom: 12,
  zIndex: 5,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  background: vars.glass.bg,
  backdropFilter: backdropFilters.panel,
  WebkitBackdropFilter: backdropFilters.panel,
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii.pill,
  boxShadow: vars.shadow.panelSm,
  "@media": {
    [media.landscapePhone]: {
      right: "auto",
      left: "auto",
      padding: "8px 8px",
      gap: space["10"],
    },
  },
});

// Search / AI actions living as end caps inside the bar — landscape phone
// only. In portrait they sit in the top corners (CornerActions); here the
// wide-but-short viewport has room to fold them into the menu bar itself.
const endCapBase = style({
  flex: "0 0 auto",
  display: "none",
  width: 54,
  height: 54,
  borderRadius: radii.pill,
  placeItems: "center",
  cursor: "pointer",
  transition: buttonTransition,
  selectors: {
    "&:active": { transform: "scale(0.96)" },
  },
  "@media": {
    [media.landscapePhone]: { display: "grid" },
  },
});

export const searchEndCap = style([
  endCapBase,
  {
    color: vars.inkSoft,
    background: "transparent",
    backdropFilter: "blur(30px)",
    border: `1px solid ${vars.glass.stroke}`,
    selectors: {
      "&:hover": { color: vars.ink, background: vars.interactive.hoverFill },
    },
  },
]);

export const assistantEndCap = style([
  endCapBase,
  {
    color: vars.paper,
    background: vars.ink,
    border: "none",
  },
]);

export const tab = style([
  fieldLabel,
  {
    flex: 1,
    transform: `translateY(-${space["0.5"]}px)`,
    display: "flex",
    position: "relative",
    flexDirection: "column",
    alignItems: "center",
    gap: space["0.5"],
    padding: 0,
    background: "transparent",
    border: "none",
    letterSpacing: "0.04em",
    textDecoration: "none",
    cursor: "pointer",
    // fieldLabel is `muted` — too faint for a primary nav. Lift the resting
    // state to inkSoft; active tabs go full ink + underline below.
    color: vars.inkSoft,
    transition: themeTransition,
    "@media": {
      [media.landscapePhone]: {
        transform: `translateY(-${space["1.5"]}px)`,
        padding: "6px 8px",
      },
    },
  },
]);

export const tabActive = style({
  color: vars.ink,
});

export const tabGlyph = style({
  display: "flex",
  position: "relative",
  alignItems: "center",
  justifyContent: "center",
  height: 22,
});

export const itemLabel = style({
  display: "none",
  position: "absolute",
  bottom: -15,
  "@media": {
    [media.landscapePhone]: {
      display: "flex",
    },
  },
});

// Always rendered so every tab reserves the same height; only the active tab
// paints it. Conditionally rendering it made the active tab taller, and the
// bar's alignItems:center then nudged its icon/label upward on select.
export const tabUnderline = style({
  position: "absolute",
  bottom: -5,
  width: 18,
  height: 2,
  borderRadius: 2,
  background: "transparent",
  marginTop: space["0.5"],
  transition: themeTransition,
  "@media": {
    [media.landscapePhone]: {
      display: "flex",
      bottom: -20,
    },
  },
});

export const tabUnderlineActive = style({
  background: vars.ink,
});

export const captureTabWrapper = style({
  flex: 1,
  minWidth: space["22"],
  height: 54,
  display: "flex",
  position: "relative",
  justifyContent: "center",
  alignItems: "center",
  "@media": {
    [media.landscapePhone]: {
      minWidth: 45,
    },
  },
});

export const captureButton = style({
  position: "absolute",
  width: 70,
  height: 70,
  top: -16,
  borderRadius: radii.pill,
  background: vars.ink,
  color: vars.paper,
  border: "none",
  cursor: "pointer",
  fontFamily: vars.font.ui,
  fontSize: 22,
  fontWeight: 600,
  display: "grid",
  placeItems: "center",
  marginTop: `-${space["7"]}`,
  boxShadow: `0 8px 24px color-mix(in srgb, ${vars.status.error} 33%, transparent), inset 0 1px 0 rgba(255,255,255,0.18)`,
  transition: buttonTransition,
  selectors: {
    "&:active": { transform: "scale(0.96)" },
  },
});

export const sheetItem = style([
  text.body,
  {
    display: "flex",
    alignItems: "center",
    gap: space["3"],
    width: "100%",
    minHeight: 48,
    padding: `0 ${space["2"]}px`,
    background: "transparent",
    border: "none",
    borderRadius: radii.md,
    color: vars.ink,
    fontWeight: 500,
    textAlign: "left",
    textDecoration: "none",
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:active": { background: vars.interactive.selectedFill },
    },
  },
]);

export const sheetItemDanger = style({
  color: vars.status.error,
});

export const sheetItemIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.inkSoft,
  selectors: {
    [`${sheetItemDanger} &`]: { color: vars.status.error },
  },
});

export const sheetItemActive = style({
  background: vars.interactive.selectedFill,
});

export const sheetDivider = style({
  height: 1,
  margin: `${space["2"]}px 0`,
  background: vars.rule,
  border: "none",
});
