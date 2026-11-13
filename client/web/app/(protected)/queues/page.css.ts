import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { display, text, fieldLabel } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";
import { themeTransition } from "@/lib/theme/transitions";

export const page = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: {
      flex: "0 0 auto",
      minHeight: "auto",
    },
  },
});

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  gap: space["4"],
  padding: "0 28px 28px",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.tablet]: {
      gridTemplateColumns: "1fr",
      flex: "0 0 auto",
      minHeight: "auto",
    },
    [media.mobile]: {
      padding: "0 0 24px",
      gap: space["3.5"],
    },
  },
});

const cardBase = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
});

export const rail = style([
  cardBase,
  {
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
  },
]);

export const railHead = style([
  fieldLabel,
  {
    padding: "0 8px 6px",
    transition: themeTransition,
  },
]);

export const railBody = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
});

export const railFooter = style({
  flexShrink: 0,
  marginTop: space["2"],
  paddingTop: space["2"],
  paddingLeft: space["1"],
  paddingRight: space["1"],
  borderTop: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const railNewButton = style({
  width: "100%",
  justifyContent: "center",
  gap: space["1.5"],
  padding: "8px 10px",
  borderRadius: radii.sm,
  border: `1px dashed ${vars.rule}`,
  color: vars.muted,
  selectors: {
    "&:hover": {
      color: vars.ink,
      borderColor: vars.glass.stroke,
      background: vars.interactive.hoverFill,
    },
  },
});

export const mainCard = style([
  cardBase,
  {
    border: `1px solid ${vars.rule}`,
    borderRadius: radii["md+2"],
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        minHeight: 540,
        borderRadius: 0,
        borderLeftWidth: 0,
        borderRightWidth: 0,
      },
    },
  },
]);

export const emptyMain = style([
  text.bodyLg,
  {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "60px 24px",
    color: vars.muted,
    textAlign: "center",
  },
]);

export const errorBanner = style([
  text.bodySm,
  {
    margin: "0 28px 14px",
    padding: "8px 12px",
    borderRadius: radii["sm+2"],
    background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.lightFill}%, transparent)`,
    border: `1px solid ${vars.status.error}`,
    color: vars.status.error,
  },
]);

export const queueHeader = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  padding: "16px 18px 12px",
  borderBottom: `1px solid ${vars.rule}`,
  flexWrap: "wrap",
  transition: themeTransition,
});

export const queueTitleInput = style([
  display.pageTitle,
  {
    flex: 1,
    minWidth: 160,
    lineHeight: "32px",
    height: 32,
    // Always-mounted title editor: titleInline's permanent accent underline
    // reads as a stuck focus state here, so show it only while editing.
    selectors: {
      "&&": { borderBottomColor: "transparent" },
      "&&:focus": { borderBottomColor: vars.accent.primary },
    },
  },
]);

export const headerControls = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexShrink: 0,
});

export const headerControlLabel = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

export const memberSection = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "8px 8px 4px",
});

export const memberFooter = style({
  flexShrink: 0,
  padding: "8px 12px 12px",
  borderTop: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const addMemberButton = style({
  width: "100%",
  justifyContent: "center",
  gap: space["1.5"],
  padding: "8px 10px",
  borderRadius: radii.sm,
  border: `1px dashed ${vars.rule}`,
  color: vars.muted,
  selectors: {
    "&:hover": {
      color: vars.ink,
      borderColor: vars.glass.stroke,
      background: vars.interactive.hoverFill,
    },
  },
});
