import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { display, text } from "@/lib/theme/typography.css";
import { backdropFilters, colorMixAlpha } from "@/lib/theme/effects";
import { themeTransition } from "@/lib/theme/transitions";

const FADE_MS = 160;
export const MODAL_FADE_MS = FADE_MS;

export const overlay = style({
  position: "fixed",
  inset: 0,
  background: vars.overlay,
  // Aligned with the Capture palette + confirm modal so every centered modal
  // feels like the same surface family.
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  zIndex: 150,
  opacity: 0,
  transition: `opacity ${FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": {
      opacity: 1,
    },
  },
});

// Sibling of overlay (Radix Dialog.Portal renders Overlay + Content as
// siblings) so backdrop-filter samples the page content directly.
export const modal = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: 151,
    top: "50%",
    left: "50%",
    width: "min(480px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 48px)",
    overflow: "visible",
    padding: "22px 24px",
    display: "flex",
    flexDirection: "column",
    gap: space["3.5"],
    fontFamily: vars.font.ui,
    color: vars.ink,
    transform: "translate(-50%, calc(-50% + 8px)) scale(0.985)",
    transition: `transform ${FADE_MS}ms ease, ${themeTransition}`,
    selectors: {
      "&[data-state='open']": {
        transform: "translate(-50%, -50%) scale(1)",
      },
    },
  },
]);

export const header = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
});

export const title = style([
  display.modalTitle,
  {
    color: vars.ink,
    margin: 0,
  },
]);

export const subtitle = style([
  text.bodySm,
  {
    color: vars.muted,
  },
]);

export const searchWrap = style({
  position: "relative",
  zIndex: 100,
  isolation: "isolate",
});

export const searchIcon = style({
  position: "absolute",
  top: "50%",
  left: 10,
  transform: "translateY(-50%)",
  color: vars.muted,
  display: "inline-flex",
});

export const searchSpinner = style({
  position: "absolute",
  top: "50%",
  right: 10,
  transform: "translateY(-50%)",
  color: vars.muted,
  display: "inline-flex",
});

// Boxed <Input> with extra left/right padding for the inline search icon +
// spinner overlay; the doubled selector beats the recipe's padding.
export const textInput = style({
  selectors: {
    "&&": { padding: "9px 36px 9px 32px" },
  },
});

export const selectedHint = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  fontSize: 11,
  color: vars.status.success,
  fontWeight: 600,
});

export const fieldHelp = style({
  fontSize: 11,
  color: vars.muted,
});

// Reserved-height containers so conditional messages don't shift surrounding
// content when they appear. Height matches the visible-state intrinsic size
// (selectedHint at fontSize 11 with icon, ~18-22px depending on font metrics).
export const placeMessageSlot = style({
  minHeight: 22,
});

export const errorSlot = style({
  minHeight: 36,
});

export const errorBlock = style({
  padding: "8px 12px",
  borderRadius: radii.sm,
  background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.lightFill}%, transparent)`,
  border: `1px solid ${vars.status.error}`,
  color: vars.status.error,
  fontSize: 12,
});

export const footer = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  justifyContent: "flex-end",
  marginTop: space["1"],
  position: "relative",
  zIndex: 0,
});

const spinKeyframe = keyframes({
  to: { transform: "translateY(-50%) rotate(360deg)" },
});

export const spinning = style({
  animationName: spinKeyframe,
  animationDuration: "0.9s",
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
});
