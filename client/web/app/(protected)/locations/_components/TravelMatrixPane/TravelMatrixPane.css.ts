import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

const paneBase = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  gap: space["3"],
  overflow: "auto",
  transition: themeTransition,
});

export const paneCard = style([
  paneBase,
  {
    border: `1px solid ${vars.rule}`,
    borderRadius: radii["md+2"],
    padding: "16px 18px",
  },
]);

// Fills the fullscreen travel-matrix modal; the modal shell owns the framing.
export const paneFill = style([
  paneBase,
  {
    flex: 1,
    padding: "14px 14px calc(16px + env(safe-area-inset-bottom, 0px))",
  },
]);

export const paneHead = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["3"],
  flexWrap: "wrap",
});

export const paneTitle = style([
  display.modalTitle,
  {
    color: vars.ink,
    lineHeight: 1,
    margin: 0,
    transition: themeTransition,
  },
]);

export const paneSubtitle = style([
  text.label,
  {
    color: vars.muted,
    transition: themeTransition,
  },
]);

export const paneLegend = style([
  text.microLabel,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2.5"],
    color: vars.muted,
    marginLeft: "auto",
  },
]);

export const legendDot = style({
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 2,
  marginRight: space["1"],
  verticalAlign: "middle",
});

export const legendDotRush = style({ background: vars.status.error });
export const legendDotRegular = style({ background: vars.ink });
export const legendDotNight = style({ background: vars.muted });

export const paneEmpty = style([
  text.body,
  {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 24px",
    color: vars.muted,
    textAlign: "center",
    flexDirection: "column",
    gap: space["2"],
  },
]);

export const paneFooter = style([
  text.label,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2.5"],
    marginTop: "auto",
    padding: "8px 12px",
    borderRadius: radii.sm,
    background: vars.glass.bgSoft,
    border: `1px solid ${vars.glass.stroke}`,
    color: vars.muted,
    transition: themeTransition,
  },
]);

export const paneFooterSpacer = style({ flex: 1 });

export const amberKeyword = style({
  color: vars.status.warning,
  fontWeight: 700,
});

export const paneFooterAction = style({
  color: vars.status.error,
  padding: 0,
  selectors: {
    "&:hover:not(:disabled)": {
      color: vars.status.error,
      textDecoration: "underline",
    },
    "&:disabled": { textDecoration: "none" },
  },
});
