import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text, caption } from "@/lib/theme/typography.css";
import { interactiveTransition, themeTransition } from "@/lib/theme/transitions";

export const trigger = style([
  text.bodySm,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["1"],
    padding: "5px 10px",
    borderRadius: radii.sm,
    border: `1px solid ${vars.rule}`,
    background: "transparent",
    color: vars.inkSoft,
    cursor: "pointer",
    transition: interactiveTransition("color", "border-color", "background-color"),
    selectors: {
      "&:hover": {
        color: vars.ink,
        borderColor: vars.glass.stroke,
        background: vars.interactive.hoverFill,
      },
    },
  },
]);

export const menu = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  minWidth: 168,
  padding: space["1.5"],
});

export const row = style([
  text.bodySm,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    padding: "6px 8px",
    borderRadius: radii.sm,
    border: "none",
    background: "transparent",
    color: vars.ink,
    cursor: "pointer",
    textAlign: "left",
    transition: interactiveTransition("background-color"),
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
      },
    },
  },
]);

export const rowCheck = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 15,
  height: 15,
  borderRadius: 4,
  border: `1px solid ${vars.rule}`,
  color: vars.textOnAccent,
  flexShrink: 0,
  transition: themeTransition,
});

globalStyle(`${rowCheck}[data-checked="true"]`, {
  background: vars.accent.primary,
  borderColor: vars.accent.primary,
});

export const hint = style([
  caption,
  {
    padding: "6px 8px 2px",
    color: vars.muted,
  },
]);
