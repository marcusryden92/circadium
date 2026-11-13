import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, zIndex, media } from "@/lib/theme/scales";
import { backdropFilters } from "@/lib/theme/effects";
import { buttonTransition } from "@/lib/theme/transitions";
import { CORNER_ACTION_SIZE, CORNER_ACTION_INSET } from "./constants";

// Floating corner chrome: search top-left, assistant top-right. Mobile-only —
// the desktop sidebar already exposes search (Ctrl+J) and the Assistant button,
// so on desktop these are redundant. On mobile the bottom floating menu has no
// search/AI, so these fill that gap. Fixed (not absolute): mainColumn scrolls
// on mobile, so an absolute child would scroll away with the content.
const cornerBase = style({
  position: "fixed",
  top: `calc(${CORNER_ACTION_INSET}px + env(safe-area-inset-top, 0px))`,
  zIndex: zIndex.raised,
  width: CORNER_ACTION_SIZE,
  height: CORNER_ACTION_SIZE,
  borderRadius: radii.pill,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  transition: buttonTransition,
  selectors: {
    "&:active": { transform: "scale(0.96)" },
  },
  "@media": {
    [media.tabletUp]: { display: "none" },
    // Landscape phone: the search / AI actions live inside the bottom menu
    // bar instead (see MobileTabs), so hide the top-corner pills there.
    [media.landscapePhone]: { display: "none" },
  },
});

export const searchButton = style([
  cornerBase,
  {
    left: CORNER_ACTION_INSET,
    color: vars.inkSoft,
    background: vars.glass.bg,
    backdropFilter: backdropFilters.modal,
    WebkitBackdropFilter: backdropFilters.modal,
    border: `1px solid ${vars.glass.stroke}`,
    selectors: {
      "&:hover": {
        color: vars.ink,
        background: vars.glass.bgDeep,
        boxShadow: vars.shadow.panel,
      },
    },
  },
]);

export const assistantButton = style([
  cornerBase,
  {
    right: CORNER_ACTION_INSET,
    color: vars.paper,
    background: vars.ink,
    border: "none",
  },
]);
