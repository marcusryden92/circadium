import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { display } from "@/lib/theme/typography.css";
import { formInput } from "@/lib/theme/recipes.css";
import { themeTransition } from "@/lib/theme/transitions";

export const card = style({
  padding: "12px 0",
  transition: themeTransition,
});

export const cardTitle = style([
  display.listTitle,
  {
    color: vars.ink,
    marginBottom: space["3"],
    transition: themeTransition,
  },
]);

export const notesInput = style([
  formInput({ variant: "boxed" }),
  {
    display: "block",
    minHeight: 96,
    resize: "none",
    lineHeight: 1.55,
    paddingTop: space["2"],
    paddingBottom: space["2"],
  },
]);
