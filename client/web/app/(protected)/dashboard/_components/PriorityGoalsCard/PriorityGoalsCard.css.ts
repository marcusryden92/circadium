import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";


export const goalsCard = style({
  padding: "16px 20px",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  "@media": {
    [media.mobile]: {
      flex: "0 0 auto",
      minHeight: "auto",
      padding: "16px 16px",
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
  },
});

export const goalsHeader = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  marginBottom: space["2"],
});

export const goalsTitle = style([
  display.panelTitle,
  {
    color: vars.ink,
    margin: 0,
    transition: themeTransition,
  },
]);

export const goalRow = style({
  padding: "12px 0",
  cursor: "pointer",
  selectors: {
    "&:not(:first-child)": {
      borderTop: `1px solid ${vars.rule}`,
    },
  },
});

export const goalHead = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const goalName = style([
  display.listTitle,
  {
    flex: 1,
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const goalFraction = style([
  text.label,
  {
    fontWeight: 700,
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const goalTrack = style({
  marginTop: space["2"],
});

export const goalFill = style({
  position: "absolute",
  inset: 0,
  borderRadius: radii.pill,
});

export const goalFooter = style({
  marginTop: space["2"],
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: space["2.5"],
});

export const goalNext = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const goalsEmpty = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 120,
  color: vars.muted,
});
