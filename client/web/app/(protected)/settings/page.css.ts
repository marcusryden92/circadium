import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { display, text, fieldLabel as fieldLabelText } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";


export const page = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
});

export const spacer = style({ flex: 1 });

export const userBadge = style([
  text.microLabel,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["2"],
    color: vars.muted,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 600,
  },
]);

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "240px 1fr",
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

export const subnav = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  paddingRight: space["1"],
  overflowY: "auto",
  minHeight: 0,
});

export const subnavItem = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  padding: "10px 12px",
  borderRadius: radii.sm,
  border: `1px solid transparent`,
  background: "transparent",
  color: vars.ink,
  fontFamily: vars.font.ui,
  fontSize: 13,
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const subnavItemActive = style({
  background: vars.ink,
  color: vars.paper,
  selectors: {
    "&:hover": { background: vars.ink },
  },
});

export const subnavItemDanger = style({
  color: vars.status.error,
});

export const subnavIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  flexShrink: 0,
});

export const content = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
});

export const scrollWrap = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: space["4"],
  paddingTop: space["4"],
  paddingBottom: space["4"],
  display: "flex",
  flexDirection: "column",
  gap: space["5"],
  "@media": {
    [media.mobile]: { paddingRight: 0 },
  },
});

export const sectionHead = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  paddingBottom: space["3"],
  flexShrink: 0,
});

export const sectionTitle = style([
  display.sectionHead,
  {
    color: vars.ink,
    margin: 0,
    lineHeight: 1.1,
    transition: themeTransition,
  },
]);

export const sectionSub = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.muted,
  letterSpacing: "0.04em",
  transition: themeTransition,
});

export const pinstripeRule = style({
  height: 1,
  flexShrink: 0,
  background: vars.rule,
  transition: themeTransition,
});

export const card = style({
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  background: "transparent",
  padding: space["5"],
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      padding: space["4"],
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
  },
});

export const cardTitle = style([
  fieldLabelText,
  {
    transition: themeTransition,
  },
]);

export const fieldGrid = style({
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: space["3"],
  "@media": { [media.mobile]: { gridTemplateColumns: "1fr" } },
});

export const fieldNote = style([
  text.label,
  {
    color: vars.muted,
    lineHeight: 1.45,
    transition: themeTransition,
  },
]);

export const rowSplit = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
});

export const rowGrow = style({ flex: 1, minWidth: 0 });

export const toggleRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
});

export const toggleMain = style({ flex: 1, minWidth: 0 });

export const toggleHead = style([
  text.body,
  {
    fontWeight: 600,
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const toggleBody = style([
  text.label,
  {
    color: vars.muted,
    marginTop: space["0.5"],
    transition: themeTransition,
  },
]);

export const toggleSwitch = style({
  position: "relative",
  width: 36,
  height: 20,
  borderRadius: radii.pill,
  border: `1px solid ${vars.rule}`,
  background: vars.glass.bgSoft,
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
  transition: themeTransition,
});

export const toggleSwitchOn = style({
  background: vars.ink,
  borderColor: vars.ink,
});

export const toggleKnob = style({
  position: "absolute",
  top: 1,
  left: 1,
  width: 16,
  height: 16,
  borderRadius: radii.pill,
  background: vars.paper,
  transition: `transform ${0.18}s ease, background ${0.18}s ease`,
});

export const toggleKnobOn = style({
  transform: "translateX(16px)",
});

export const transportRow = style({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: space["1.5"],
  "@media": { [media.mobile]: { gridTemplateColumns: "repeat(2, 1fr)" } },
});

export const transportBtn = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space["1.5"],
  padding: "12px 8px",
  borderRadius: radii["sm+2"],
  border: `1px solid ${vars.rule}`,
  background: vars.glass.bgSoft,
  color: vars.ink,
  cursor: "pointer",
  fontFamily: vars.font.ui,
  fontSize: 11.5,
  fontWeight: 500,
  transition: themeTransition,
  selectors: {
    "&:hover": { background: vars.glass.bgDeep },
  },
});

export const transportBtnActive = style({
  background: vars.ink,
  color: vars.paper,
  borderColor: vars.ink,
  selectors: {
    "&:hover": { background: vars.ink },
  },
});

export const providerRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  padding: "10px 12px",
  borderRadius: radii["sm+2"],
  border: `1px solid ${vars.rule}`,
  background: "transparent",
  transition: themeTransition,
});

export const providerIcon = style({
  width: 28,
  height: 28,
  borderRadius: radii.sm,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: vars.glass.bgSoft,
  color: vars.ink,
  flexShrink: 0,
  transition: themeTransition,
});

export const providerMain = style({ flex: 1, minWidth: 0 });

export const providerName = style([
  text.body,
  {
    fontWeight: 600,
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const providerStatus = style([
  text.label,
  {
    color: vars.muted,
    transition: themeTransition,
  },
]);

export const footerRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  justifyContent: "flex-end",
});

export const footerMessage = style([
  text.label,
  {
    flex: 1,
    color: vars.muted,
  },
]);

export const footerMessageSuccess = style({
  color: vars.status.success,
});

export const footerMessageError = style({
  color: vars.status.error,
});

export const comingSoon = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 24px",
  textAlign: "center",
  color: vars.muted,
  fontFamily: vars.font.ui,
  fontSize: 13,
  gap: space["1.5"],
});

export const comingSoonTitle = style([
  display.panelTitle,
  {
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const dangerNote = style({
  padding: "12px 14px",
  borderRadius: radii["sm+2"],
  border: `1px solid ${vars.status.error}`,
  background: vars.glass.bgSoft,
  color: vars.status.error,
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.45,
  transition: themeTransition,
});
