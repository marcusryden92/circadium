import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";

export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  flexWrap: "wrap",
});

export const importControls = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  flexWrap: "wrap",
});

export const statusText = style([
  text.label,
  {
    color: vars.muted,
  },
]);

export const privacyRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  color: vars.muted,
});

export const privacyLink = style([
  text.label,
  {
    color: vars.accent.primary,
    textDecoration: "none",
    selectors: {
      "&:hover": { textDecoration: "underline" },
    },
  },
]);
