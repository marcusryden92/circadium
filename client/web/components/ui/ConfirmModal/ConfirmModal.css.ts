import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { media, space } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { backdropFilters } from "@/lib/theme/effects";
import { themeTransition } from "@/lib/theme/transitions";

export const CONFIRM_FADE_MS = 180;

export const overlay = style({
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: vars.overlay,
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  opacity: 0,
  transition: `opacity ${CONFIRM_FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": {
      opacity: 1,
    },
  },
});

export const modal = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: 101,
    top: "50%",
    left: "50%",
    padding: "18px 20px 20px",
    width: "min(440px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 64px)",
    overflow: "auto",
    transform: "translate(-50%, calc(-50% + 8px)) scale(0.985)",
    transition: `transform ${CONFIRM_FADE_MS}ms ease, ${themeTransition}`,
    selectors: {
      "&[data-state='open']": {
        transform: "translate(-50%, -50%) scale(1)",
      },
    },
    // Mobile presents as a bottom sheet: docked to the bottom edge, full
    // width, sliding up — matching the shared BottomSheet language.
    "@media": {
      [media.mobile]: {
        top: "auto",
        bottom: 0,
        left: 0,
        width: "100%",
        maxHeight: ["85vh", "85dvh"],
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: "18px 16px calc(20px + env(safe-area-inset-bottom))",
        transform: "translateY(16px)",
        selectors: {
          "&[data-state='open']": {
            transform: "translateY(0)",
          },
        },
      },
    },
  },
]);

export const modalTitle = style({
  fontFamily: vars.font.display,
  fontSize: 22,
  fontWeight: 500,
  letterSpacing: "-0.02em",
  color: vars.ink,
  margin: 0,
  transition: themeTransition,
});

export const modalBody = style({
  marginTop: space["2.5"],
  fontSize: 13,
  color: vars.inkSoft,
  fontFamily: vars.font.ui,
  lineHeight: 1.5,
  transition: themeTransition,
});

export const modalActions = style({
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: space["2"],
  marginTop: space["6"],
  flexWrap: "wrap",
  // Mobile stacks the actions full width — three sm pills in a row wrap
  // awkwardly and make poor touch targets.
  "@media": {
    [media.mobile]: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: space["2"],
    },
  },
});

// Cancel drops below the real choices in the mobile stack (row order keeps
// it between them on desktop).
export const modalCancel = style({
  "@media": {
    [media.mobile]: { order: 99 },
  },
});

globalStyle(`${modalActions} > *`, {
  "@media": {
    [media.mobile]: {
      width: "100%",
      justifyContent: "center",
      minHeight: 44,
    },
  },
});
