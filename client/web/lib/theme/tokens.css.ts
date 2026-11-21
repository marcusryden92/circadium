import { createThemeContract } from "@vanilla-extract/css";

export const vars = createThemeContract({
  paper: null,
  bezel: null,
  ink: null,
  inkSoft: null,
  muted: null,
  rule: null,
  textOnAccent: null,
  overlay: null,
  tileFill: null,

  // Shell chrome surfaces, sourced per theme from the grayscale ramp (scales.ts).
  // modal is the centered-modal tier (popover recipe xl): it floats over the
  // page overlay, so it sits one elevation rung above content.
  surface: {
    canvas: null,
    sidebar: null,
    content: null,
    modal: null,
  },

  glass: {
    bg: null,
    bgDeep: null,
    bgSoft: null,
    stroke: null,
    hi: null,
  },

  // Interaction fills. hoverFill inverts direction per theme (darkens on
  // light paper, brightens on dark paper) so hovers stay visible in both
  // modes. selectedFill is the persistent active/selected row state — a
  // stronger version of the same idea. Prefer these over reaching for
  // glass.bgSoft/bgDeep when the intent is "row hover" or "selected row".
  interactive: {
    hoverFill: null,
    selectedFill: null,
  },

  shadow: {
    panel: null,
    panelSm: null,
  },

  noise: {
    opacity: null,
    blend: null,
  },

  accent: {
    primary: null,
    now: null,
    done: null,
    secondary: null,
  },

  status: {
    success: null,
    warning: null,
    error: null,
    info: null,
  },

  swatches: {
    blue: null,
    green: null,
    violet: null,
    indigo: null,
    cyan: null,
    amber: null,
    rose: null,
    teal: null,
  },

  font: {
    display: null,
    ui: null,
  },
});

export type ThemeVars = typeof vars;
