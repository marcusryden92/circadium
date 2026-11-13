import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text, fieldLabel as fieldLabelText } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  minWidth: 0,
});

export const fieldLabelCls = style([
  fieldLabelText,
  {
    transition: themeTransition,
  },
]);

export const fieldNote = style([
  text.label,
  {
    color: vars.muted,
    lineHeight: 1.45,
    transition: themeTransition,
  },
]);
