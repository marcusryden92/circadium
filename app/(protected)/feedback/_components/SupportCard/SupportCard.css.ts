import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const card = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
  },
});

export const cardHead = style([
  fieldLabel,
  {
    padding: "14px 18px 0",
    transition: themeTransition,
  },
]);

export const cardBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  padding: "10px 18px 16px",
});

export const intro = style([
  text.bodySm,
  {
    margin: 0,
    color: vars.inkSoft,
  },
]);

export const mailLink = style({
  color: vars.accent.primary,
  textDecoration: "none",
  selectors: {
    "&:hover": { textDecoration: "underline" },
  },
});

export const messageArea = style([
  text.body,
  {
    width: "100%",
    minHeight: 140,
    maxHeight: 320,
    resize: "vertical",
    padding: "10px 12px",
    color: vars.ink,
    background: "transparent",
    border: `1px solid ${vars.glass.stroke}`,
    borderRadius: radii.sm,
    outline: "none",
    fontFamily: vars.font.ui,
    transition: themeTransition,
    selectors: {
      "&::placeholder": { color: vars.muted },
      "&:focus": { borderColor: vars.accent.primary },
      "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
    },
  },
]);

export const snapshotBlock = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  padding: "10px 12px",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii.sm,
  transition: themeTransition,
});

export const snapshotTopRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
});

export const snapshotLabel = style([
  text.row,
  {
    color: vars.ink,
    cursor: "pointer",
  },
]);

export const snapshotHint = style([
  text.bodySm,
  {
    margin: 0,
    color: vars.muted,
  },
]);

export const footer = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  flexWrap: "wrap",
});

export const statusText = style([text.bodySm, {}]);
