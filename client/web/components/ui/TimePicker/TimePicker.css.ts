import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex } from "@/lib/theme/scales";
import { formInput, popover } from "@/lib/theme/recipes.css";
import { themeTransition } from "@/lib/theme/transitions";

export const wrap = style({
  display: "inline-block",
});

export const trigger = style([
  formInput({ variant: "boxed" }),
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["1.5"],
    width: "auto",
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
    textAlign: "left",
    selectors: {
      "&:disabled": { cursor: "not-allowed", opacity: 0.5 },
    },
  },
]);

export const triggerIcon = style({
  color: vars.muted,
  flexShrink: 0,
  transition: themeTransition,
});

export const triggerPlaceholder = style({
  color: vars.muted,
});

export const panel = style([
  popover({ size: "md" }),
  {
    display: "flex",
    gap: space["1"],
    padding: space["2"],
    zIndex: zIndex.modalOver,
  },
]);

export const column = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  height: 208,
  overflowY: "auto",
  paddingRight: space["0.5"],
});

export const option = style({
  flexShrink: 0,
  width: 44,
  height: 28,
  border: "none",
  borderRadius: radii.sm,
  background: "transparent",
  fontFamily: vars.font.ui,
  fontSize: 12.5,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  color: vars.ink,
  cursor: "pointer",
  padding: 0,
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
    "&:focus-visible": {
      outline: `1px solid ${vars.accent.primary}`,
    },
  },
});

export const optionActive = style({
  background: vars.accent.primary,
  color: vars.textOnAccent,
  fontWeight: 700,
  selectors: {
    "&:hover": {
      background: vars.accent.primary,
    },
  },
});
