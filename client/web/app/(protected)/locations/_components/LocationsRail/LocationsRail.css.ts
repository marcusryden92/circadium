import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const rail = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  padding: "12px 8px 8px",
  background: "transparent",
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      minHeight: "auto",
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
  },
});

export const railHead = style([
  fieldLabel,
  {
    padding: "0 8px 6px",
    transition: themeTransition,
    "@media": {
      [media.mobile]: { order: -2 },
    },
  },
]);

export const railBody = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
});

export const railEmpty = style([
  text.bodySm,
  {
    padding: "12px 8px",
    color: vars.muted,
  },
]);

export const railRow = style([
  text.row,
  {
    display: "flex",
    alignItems: "flex-start",
    gap: space["2"],
    padding: "8px 8px",
    borderRadius: radii.sm,
    cursor: "pointer",
    color: vars.ink,
    background: "transparent",
    border: "1px solid transparent",
    transition: themeTransition,
    textAlign: "left",
    width: "100%",
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
    },
  },
]);

export const railRowPin = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  color: vars.muted,
  flexShrink: 0,
  marginTop: space["0.5"],
});

export const railRowMeta = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  flex: 1,
  minWidth: 0,
});

export const railRowName = style({
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const railRowAddress = style([
  text.microLabel,
  {
    color: vars.muted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontVariantNumeric: "tabular-nums",
  },
]);

export const railRowTags = style({
  marginTop: space["1"],
  display: "flex",
  flexWrap: "wrap",
  gap: space["1"],
});

export const railRowTag = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 9.5,
  fontFamily: vars.font.ui,
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: vars.muted,
  background: vars.glass.bgSoft,
  border: `1px solid ${vars.glass.stroke}`,
  transition: themeTransition,
});

export const railRowTagDot = style({
  width: 6,
  height: 6,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const railFooter = style({
  flexShrink: 0,
  marginTop: space["2"],
  paddingTop: space["2"],
  paddingLeft: space["1"],
  paddingRight: space["1"],
  borderTop: `1px solid ${vars.rule}`,
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
  transition: themeTransition,
  // The mobile page scrolls as one column, so the add action moves above the
  // list — below a long list it sits off-viewport.
  "@media": {
    [media.mobile]: {
      order: -1,
      marginTop: 0,
      paddingTop: 0,
      borderTop: "none",
      marginBottom: space["1"],
      paddingBottom: space["2"],
      borderBottom: `1px solid ${vars.rule}`,
    },
  },
});

export const railNote = style([
  text.microLabel,
  {
    color: vars.muted,
    textAlign: "center",
    padding: "0 6px",
    transition: themeTransition,
  },
]);

export const railNewButton = style({
  width: "100%",
  justifyContent: "center",
  gap: space["1.5"],
  padding: "8px 10px",
  borderRadius: radii.sm,
  border: `1px dashed ${vars.rule}`,
  color: vars.muted,
  selectors: {
    "&:hover:not(:disabled)": {
      color: vars.ink,
      borderColor: vars.glass.stroke,
      background: vars.interactive.hoverFill,
    },
  },
});
