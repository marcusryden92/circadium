import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const boxesCol = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  minWidth: 0,
});

export const inputsGrid = style({
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(70px, 1fr))",
  gap: space["2"],
});

export const inputStack = style({
  display: "flex",
  flexDirection: "column",
  maxWidth: 60,
  gap: space["1"],
});

export const inputCaption = style([
  fieldLabel,
  {
    whiteSpace: "nowrap",
    transition: themeTransition,
  },
]);

export const progressNote = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const completedRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  marginTop: space["1"],
});
