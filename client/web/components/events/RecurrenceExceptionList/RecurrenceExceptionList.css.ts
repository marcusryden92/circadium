import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

const rowBase = style({
  display: "flex",
  alignItems: "center",
  color: vars.ink,
  transition: themeTransition,
});

export const row = styleVariants({
  card: [rowBase, text.body, { gap: space["3"], padding: "6px 0" }],
  rail: [
    rowBase,
    text.label,
    { gap: space["1.5"], fontVariantNumeric: "tabular-nums" },
  ],
});

export const time = style({
  fontVariantNumeric: "tabular-nums",
  color: vars.inkSoft,
});

export const arrow = style({
  color: vars.muted,
});

export const skipped = style({
  color: vars.muted,
  fontStyle: "italic",
});

const restoreBase = style([
  text.microLabel,
  {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: space["1"],
    background: "transparent",
    color: vars.muted,
    fontWeight: 600,
    cursor: "pointer",
    transition: themeTransition,
  },
]);

export const restore = styleVariants({
  card: [
    restoreBase,
    {
      border: `1px solid ${vars.glass.stroke}`,
      borderRadius: radii.pill,
      padding: "3px 10px",
      selectors: {
        "&:hover": {
          background: vars.interactive.hoverFill,
          color: vars.ink,
        },
      },
    },
  ],
  rail: [
    restoreBase,
    {
      border: "none",
      borderRadius: radii.sm,
      fontSize: 10.5,
      padding: "2px 4px",
      selectors: {
        "&:hover": {
          color: vars.ink,
          background: `color-mix(in srgb, ${vars.ink} 6%, transparent)`,
        },
      },
    },
  ],
});
