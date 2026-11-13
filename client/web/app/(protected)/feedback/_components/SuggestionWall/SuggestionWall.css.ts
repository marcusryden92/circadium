import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const card = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
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

export const composer = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
  padding: "10px 18px 14px",
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const composerHint = style([
  text.bodySm,
  {
    margin: 0,
    color: vars.muted,
  },
]);

export const bodyArea = style([
  text.bodySm,
  {
    width: "100%",
    minHeight: 56,
    maxHeight: 220,
    resize: "vertical",
    padding: "8px 12px",
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

export const composerFooter = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
});

export const statusText = style([text.bodySm, {}]);

export const list = style({
  display: "flex",
  flexDirection: "column",
  padding: "6px 8px 10px",
});

export const emptyList = style([
  text.bodySm,
  {
    padding: "28px 18px",
    color: vars.muted,
    textAlign: "center",
  },
]);

export const row = style({
  display: "flex",
  gap: space["3"],
  padding: "10px 10px",
  borderRadius: radii.sm,
  transition: themeTransition,
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const voteColumn = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space["0.5"],
  flexShrink: 0,
  width: 32,
});

export const voteButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 22,
  padding: 0,
  border: "none",
  background: "transparent",
  borderRadius: radii.xs,
  color: vars.muted,
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:hover": { color: vars.ink, background: vars.interactive.hoverFill },
    "&[data-active='true']": { color: vars.accent.primary },
    "&:disabled": { opacity: 0.5, cursor: "default" },
  },
});

export const voteScore = style([
  text.row,
  {
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
  },
]);

export const rowMain = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
});

export const rowTitle = style([
  text.row,
  {
    color: vars.ink,
    overflowWrap: "anywhere",
  },
]);

export const rowBody = style([
  text.bodySm,
  {
    margin: 0,
    color: vars.inkSoft,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
]);

export const rowMeta = style([
  text.microLabel,
  {
    color: vars.muted,
  },
]);

export const rowDelete = style({
  alignSelf: "flex-start",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  padding: 0,
  border: "none",
  background: "transparent",
  borderRadius: radii.xs,
  color: vars.muted,
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:hover": { color: vars.status.error, background: vars.interactive.hoverFill },
  },
});

export const loadingWrap = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "36px 0",
});
