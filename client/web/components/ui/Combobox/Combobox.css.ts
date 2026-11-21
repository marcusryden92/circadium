import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

export const comboboxWrap = style({
  position: "relative",
  display: "inline-block",
});

export const comboboxTrigger = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  padding: "5px 10px",
  borderRadius: radii.pill,
  background: vars.glass.bgDeep,
  border: `1px solid ${vars.glass.stroke}`,
  fontSize: 12,
  fontFamily: vars.font.ui,
  fontWeight: 600,
  color: vars.ink,
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.glass.bg,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.accent.primary}`,
      outlineOffset: 1,
    },
  },
});

export const comboSmallPadding = style({ padding: space["1"] });

export const comboboxTriggerDisabled = style({
  cursor: "not-allowed",
  opacity: 0.5,
  selectors: {
    "&:hover": {
      background: vars.glass.bgDeep,
    },
  },
});

export const comboboxChevron = style({
  color: vars.muted,
  flexShrink: 0,
  transition: themeTransition,
});

export const comboboxMenu = style({
  maxWidth: 280,
  maxHeight: 280,
  overflow: "auto",
  background: vars.paper,
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii.md,
  boxShadow: vars.shadow.panel,
  zIndex: 100,
  padding: space["1"],
  display: "flex",
  flexDirection: "column",
  gap: space["px"],
  transition: themeTransition,
});

export const comboboxOption = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "7px 10px",
  borderRadius: radii.sm,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 12.5,
  fontFamily: vars.font.ui,
  fontWeight: 500,
  color: vars.ink,
  textAlign: "left",
  whiteSpace: "nowrap",
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
  },
});

export const comboboxOptionActive = style({
  background: vars.glass.bgDeep,
  fontWeight: 700,
});
