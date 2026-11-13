import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media, zIndex } from "@/lib/theme/scales";
import { text, caption, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const panel = style({
  position: "absolute",
  top: 0,
  left: 0,
  width: 244,
  maxWidth: "100%",
  padding: space["3.5"],
  background: vars.glass.bgDeep,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: `1px solid ${vars.glass.stroke}`,
  // Docked flush into the container's top-left corner: match the canvas card's
  // radius so the rounded corners nest instead of a smaller card poking out.
  borderRadius: radii["md+2"],
  boxShadow: vars.shadow.panel,
  zIndex: zIndex.floating,
  transition: themeTransition,
  selectors: {
    // Collapsed: fade the card away so only the toggle remains, sitting bare on
    // the canvas. Padding is kept so the toggle stays put and the card simply
    // materializes around it when opened; pointer-events go to the toggle alone
    // so the invisible card never intercepts a canvas pan/hover.
    "&[data-open='false']": {
      width: "auto",
      background: "transparent",
      backdropFilter: "none",
      WebkitBackdropFilter: "none",
      borderColor: "transparent",
      boxShadow: "none",
      pointerEvents: "none",
    },
  },
  "@media": {
    [media.mobile]: {
      width: 208,
    },
  },
});

export const header = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const title = style([
  caption,
  {
    appearance: "none",
    WebkitAppearance: "none",
    border: "none",
    background: "transparent",
    padding: 0,
    color: vars.ink,
    fontWeight: 650,
    letterSpacing: "0.02em",
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      // The collapsed card is pointer-events:none; the label re-claims events so
      // clicking "Settings" reopens it, just like the toggle beside it.
      "&[data-open='false']": {
        pointerEvents: "auto",
      },
    },
  },
]);

export const collapse = style({
  appearance: "none",
  WebkitAppearance: "none",
  border: "none",
  background: "transparent",
  color: vars.muted,
  cursor: "pointer",
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  lineHeight: 1,
  borderRadius: radii.sm,
  transition: themeTransition,
  selectors: {
    "&:hover": {
      color: vars.ink,
      background: vars.interactive.hoverFill,
    },
    // The collapsed card is pointer-events:none, so the toggle re-claims events
    // for itself while the rest of the bare label lets canvas pans through.
    "&[data-open='false']": {
      pointerEvents: "auto",
    },
  },
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  marginTop: space["3"],
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  selectors: {
    "&[data-disabled]": {
      opacity: 0.4,
      pointerEvents: "none",
    },
  },
});

export const fieldRow = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
});

export const label = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

export const value = style([
  text.microLabel,
  {
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

// Mirrors the header zoom slider: a thin bordered track, an inkSoft fill up to
// the thumb, and a plain ink thumb (no chunky ring).
const SLIDER_THUMB = 13;
const SLIDER_TRACK_H = 6;

export const sliderTrack = style({
  position: "relative",
  width: "100%",
  height: SLIDER_THUMB,
});

export const sliderBar = style({
  position: "absolute",
  left: 0,
  right: 0,
  top: "50%",
  transform: "translateY(-50%)",
  height: SLIDER_TRACK_H,
  borderRadius: radii.pill,
  background: "transparent",
  border: `1px solid ${vars.glass.stroke}`,
  pointerEvents: "none",
  transition: themeTransition,
});

export const sliderFill = style({
  position: "absolute",
  left: 0,
  top: "50%",
  transform: "translateY(-50%)",
  height: SLIDER_TRACK_H,
  borderRadius: radii.pill,
  background: vars.inkSoft,
  pointerEvents: "none",
  transition: themeTransition,
});

export const slider = style({
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
