import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { interactiveTransition } from "@/lib/theme/transitions";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const overrideRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  flexWrap: "wrap",
});

const overrideLabelBase = style([
  text.label,
  {
    fontWeight: 600,
  },
]);

export const overrideLabel = styleVariants({
  custom: [overrideLabelBase, { color: vars.ink }],
  inherited: [overrideLabelBase, { color: vars.muted }],
});

const comboWrapBase = style({
  transition: interactiveTransition("opacity"),
});

export const comboWrap = styleVariants({
  enabled: [comboWrapBase, { opacity: 1, pointerEvents: "auto" }],
  inheriting: [comboWrapBase, { opacity: 0.55, pointerEvents: "none" }],
});

export const optionLabel = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["2"],
});

export const valueWrap = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  flex: 1,
  minWidth: 0,
});

export const valueIcon = style({
  flexShrink: 0,
});

export const valueText = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
});
