import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { display, text, caption, fieldLabel } from "@/lib/theme/typography.css";
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
    // A landscape phone is short, not narrow — the portrait block-and-scroll
    // treatment would make the canvas taller than the viewport, so keep the
    // desktop fill layout.
    [media.landscapePhone]: {
      flex: 1,
      minHeight: 0,
    },
  },
});

export const subHeader = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["3"],
  padding: "20px 28px 12px",
  flexShrink: 0,
  flexWrap: "wrap",
  "@media": {
    [media.mobile]: {
      padding: "10px 14px 8px",
      gap: space["2.5"],
      // The mobile row carries 34px icon buttons; center them and the title
      // on one axis. titleGroup keeps title + summary baseline-aligned inside.
      alignItems: "center",
    },
  },
});

export const titleGroup = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["3"],
  minWidth: 0,
  "@media": {
    [media.mobile]: {
      gap: space["2.5"],
    },
  },
});

export const pageTitle = style([
  display.pageTitle,
  {
    color: vars.ink,
    lineHeight: 1,
    margin: 0,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { fontSize: 24 },
    },
  },
]);

export const titleSummary = style([
  text.bodySm,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const headerControls = style({
  display: "flex",
  alignItems: "center",
  gap: space["4"],
  marginLeft: "auto",
  flexWrap: "wrap",
  "@media": {
    [media.mobile]: {
      marginLeft: 0,
      width: "100%",
      gap: space["3"],
    },
  },
});

export const controlGroup = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const controlLabel = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

// Mobile-only header chrome: canvas routes hide the shell tab bar, so the
// header carries a back button and a settings trigger instead.
const headerIconButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  flexShrink: 0,
  padding: 0,
  background: "transparent",
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii.pill,
  color: vars.ink,
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:active": { background: vars.interactive.selectedFill },
  },
});

export const backButton = headerIconButton;

export const settingsButton = style([
  headerIconButton,
  { marginLeft: "auto" },
]);

// Custom zoom slider: a native range input (transparent track, only its thumb
// visible) layered over a transparent bordered track and a solid fill bar. The
// fill width is computed with a thumb-radius correction so its right edge tracks
// the thumb centre (THUMB_PX must match the value used in page.tsx).
const SLIDER_TRACK_HEIGHT = 6;
const SLIDER_THUMB = 13;

export const zoomTrack = style({
  position: "relative",
  width: 300,
  height: SLIDER_THUMB,
  "@media": {
    [media.tablet]: { width: 200 },
    [media.mobile]: { width: 150 },
  },
});

export const zoomTrackBar = style({
  position: "absolute",
  left: 0,
  right: 0,
  top: "50%",
  transform: "translateY(-50%)",
  height: SLIDER_TRACK_HEIGHT,
  borderRadius: radii.pill,
  background: "transparent",
  border: `1px solid ${vars.glass.stroke}`,
  pointerEvents: "none",
  transition: themeTransition,
});

export const zoomFill = style({
  position: "absolute",
  left: 0,
  top: "50%",
  transform: "translateY(-50%)",
  height: SLIDER_TRACK_HEIGHT,
  borderRadius: radii.pill,
  background: vars.inkSoft,
  pointerEvents: "none",
  transition: themeTransition,
});

export const zoomSlider = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  WebkitAppearance: "none",
  appearance: "none",
  background: "transparent",
  outline: "none",
  cursor: "pointer",
  selectors: {
    "&::-webkit-slider-thumb": {
      WebkitAppearance: "none",
      appearance: "none",
      width: SLIDER_THUMB,
      height: SLIDER_THUMB,
      borderRadius: radii.pill,
      background: vars.ink,
      border: "none",
      cursor: "pointer",
    },
    "&::-moz-range-thumb": {
      width: SLIDER_THUMB,
      height: SLIDER_THUMB,
      border: "none",
      borderRadius: radii.pill,
      background: vars.ink,
      cursor: "pointer",
    },
    "&::-moz-range-track": {
      background: "transparent",
    },
  },
});

export const legendRow = style([
  caption,
  {
    display: "flex",
    alignItems: "center",
    gap: space["5"],
    flexWrap: "wrap",
    padding: "0 28px 12px",
    color: vars.muted,
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        padding: "0 16px 10px",
        gap: space["3.5"],
      },
    },
  },
]);

export const legendItem = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
});

export const legendKeys = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["6"],
  marginLeft: "auto",
});

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

export const canvasCard = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
  flex: 1,
  margin: "0 28px 28px",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      margin: "0 0 24px",
      minHeight: 480,
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
    [media.landscapePhone]: {
      margin: 0,
      minHeight: 0,
    },
  },
});

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

// Rows for the mobile settings sheet — the header controls relocated as
// full-width label + control rows.
export const sheetSection = style([
  fieldLabel,
  {
    color: vars.muted,
    padding: `${space["3"]}px ${space["2"]}px ${space["1"]}px`,
  },
]);

export const sheetRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["4"],
  minHeight: 44,
  padding: `0 ${space["2"]}px`,
});

export const sheetRowLabel = style([
  text.body,
  {
    color: vars.ink,
    fontWeight: 500,
  },
]);

export const sheetZoomTrack = style({
  position: "relative",
  flex: 1,
  maxWidth: 320,
  height: SLIDER_THUMB,
});

export const sheetHint = style([
  caption,
  {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space["3.5"],
    color: vars.muted,
    padding: `${space["3"]}px ${space["2"]}px 0`,
  },
]);

// Landscape phones: the settings sheet's single column stretches viewport-wide
// with a long scroll, so the two control groups sit side by side instead.
export const sheetColumns = style({
  display: "flex",
  flexDirection: "column",
  "@media": {
    [media.landscapePhone]: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      columnGap: space["10"],
      alignItems: "start",
    },
  },
});

export const sheetColumn = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});
