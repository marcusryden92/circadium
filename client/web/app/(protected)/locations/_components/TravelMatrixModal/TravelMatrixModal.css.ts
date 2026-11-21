import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, zIndex } from "@/lib/theme/scales";
import { fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

const FADE_MS = 220;

// Fixed to the viewport rather than absolute-in-main-column (the
// WeekStructureModal pattern): the locations page scrolls on mobile, so an
// absolute overlay would scroll with it. Sits at zIndex.modal; the travel-time
// editor (modalOver) and ConfirmModal stack above it.
export const overlay = style({
  position: "fixed",
  inset: 0,
  zIndex: zIndex.modal,
  background: vars.overlay,
  opacity: 0,
  transition: `opacity ${FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": { opacity: 1 },
  },
});

// Same zIndex as the overlay (content follows it in the DOM): raising it to
// modal + 1 would trap ConfirmModal's dim backdrop (also zIndex.modal, mounted
// later) behind this opaque surface.
export const modal = style({
  position: "fixed",
  inset: 0,
  zIndex: zIndex.modal,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  isolation: "isolate",
  padding: 0,
  background: vars.paper,
  opacity: 0,
  transform: "translateY(8px) scale(0.995)",
  transition: `${themeTransition}, opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  selectors: {
    "&[data-state='open']": {
      opacity: 1,
      transform: "translateY(0) scale(1)",
    },
  },
});

export const banner = style({
  position: "relative",
  zIndex: 1,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: space["3.5"],
  padding: `calc(8px + env(safe-area-inset-top, 0px)) 16px 8px`,
  background: vars.ink,
  color: vars.paper,
  transition: themeTransition,
});

export const bannerTitle = style([
  fieldLabel,
  {
    margin: 0,
    transition: themeTransition,
    // fieldLabel bundles color: vars.muted; a doubled selector outranks that
    // single-class preset so paper wins on the dark ink banner, order-safe.
    selectors: {
      "&&": { color: vars.paper },
    },
  },
]);

export const bannerSpacer = style({ flex: 1 });

export const closeButton = style({
  // Beat pillBtn's ghost `color: vars.inkSoft` (which matches the ink banner
  // background in both themes) via a doubled selector — order-independent.
  selectors: {
    "&&": { color: vars.paper },
    "&&:hover:not(:disabled)": { color: vars.paper },
  },
});

export const controlsRow = style({
  position: "relative",
  zIndex: 1,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: space["2"],
  padding: "12px 14px 0",
});
