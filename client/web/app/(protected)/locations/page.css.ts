import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";
import { themeTransition } from "@/lib/theme/transitions";

export const page = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: { flex: "0 0 auto", minHeight: "auto" },
  },
});

export const loadingWrap = style({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 28px 28px",
  marginBottom: space["12"],
});

export const headActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexShrink: 0,
  flexWrap: "wrap",
  // marginLeft: auto keeps the cluster right-aligned even when the PageHeader
  // row wraps it onto its own line — without it, a wrapped row reverts to the
  // left edge and the title sits visually orphaned.
  marginLeft: "auto",
});

// Inline status pill that sits in the PageHeader row before the action
// cluster. Translucent tinted background; the surrounding flex layout keeps
// the action cluster right-aligned whether the banner is present or not.
export const banner = style([
  text.label,
  {
    padding: "5px 12px",
    borderRadius: radii.pill,
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: themeTransition,
  },
]);

export const successBanner = style([
  banner,
  {
    background: `color-mix(in srgb, ${vars.status.success} ${colorMixAlpha.lightFill}%, transparent)`,
    border: `1px solid ${vars.status.success}`,
    color: vars.status.success,
  },
]);

export const errorBanner = style([
  banner,
  {
    background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.lightFill}%, transparent)`,
    border: `1px solid ${vars.status.error}`,
    color: vars.status.error,
  },
]);

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "300px 1fr",
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

// Mobile stand-in for the matrix pane: a compact card that opens the
// fullscreen TravelMatrixModal.
export const matrixLauncher = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: space["2.5"],
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  padding: "14px 16px 16px",
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
  },
});

export const matrixLauncherTitle = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

export const matrixLauncherNote = style([
  text.bodySm,
  {
    color: vars.muted,
    transition: themeTransition,
  },
]);

export const matrixLauncherButton = style({
  width: "100%",
  justifyContent: "center",
});
