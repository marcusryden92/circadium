import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";

export const note = style([
  text.label,
  {
    display: "flex",
    alignItems: "center",
    gap: space["1.5"],
    color: vars.muted,
    lineHeight: 1.45,
  },
]);

export const noteIcon = style({
  flexShrink: 0,
});
