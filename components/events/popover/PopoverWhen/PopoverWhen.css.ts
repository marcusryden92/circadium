import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";

export const whenRow = style([
  text.bodySm,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
  },
]);

export const whenIcon = style({
  color: vars.muted,
  flexShrink: 0,
});
