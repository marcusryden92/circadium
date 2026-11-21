import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text, fieldLabel as fieldLabelPreset } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

const stackBase = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

// sm: dense drawers/modals. md: multi-column grid rows (fixed height keeps the
// columns even). lg: onboarding — body-size sentence labels.
export const fieldStack = styleVariants({
  sm: [stackBase, { gap: space["1.5"] }],
  md: [stackBase, { gap: space["2"], minHeight: 60 }],
  lg: [stackBase, { gap: space["2"] }],
});

// Spans the full width of a multi-column field grid (e.g. IdentityCard's Place row).
export const fieldStackFull = style({
  gridColumn: "1 / -1",
});

const capsLabel = style([
  fieldLabelPreset,
  {
    whiteSpace: "nowrap",
    transition: themeTransition,
  },
]);

export const fieldLabel = styleVariants({
  sm: [capsLabel],
  md: [capsLabel],
  lg: [text.body, { color: vars.ink, transition: themeTransition }],
});

export const fieldValue = style([
  text.row,
  {
    fontWeight: 600,
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);
