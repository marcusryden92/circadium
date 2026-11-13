import { style } from "@vanilla-extract/css";
import { themeDark } from "@/lib/theme/themes.css";
import { DURATIONS } from "@/lib/theme/transitions";

const base = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 0,
});

// `background-image` with stacked gradients does not interpolate reliably
// across browsers, so the theme transitions snap. Instead, render both the
// light and dark variants and cross-fade their opacity — opacity transitions
// are smooth everywhere.

const stripeLight = "rgba(22,20,42,0.055)";
const stripeDark = "rgba(255,255,255,0.05)";

const fadeLayer = style({
  transition: `opacity ${DURATIONS.theme}s ease`,
});

export const pinstripeLight = style([
  base,
  fadeLayer,
  {
    opacity: 1,
    background: `repeating-linear-gradient(45deg, transparent 0, transparent 9px, ${stripeLight} 9px, ${stripeLight} 10px)`,
    selectors: {
      [`.${themeDark} &`]: { opacity: 0 },
    },
  },
]);

export const pinstripeDark = style([
  base,
  fadeLayer,
  {
    opacity: 0,
    background: `repeating-linear-gradient(45deg, transparent 0, transparent 9px, ${stripeDark} 9px, ${stripeDark} 10px)`,
    selectors: {
      [`.${themeDark} &`]: { opacity: 1 },
    },
  },
]);
