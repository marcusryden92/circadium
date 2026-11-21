import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

export const bezelFrame = style({
  width: "100vw",
  height: "100vh",
  boxSizing: "border-box",
  background: vars.bezel,
  padding: space["1.5"],
  display: "flex",
  overflow: "hidden",
  transition: themeTransition,
  "@media": {
    [media.mobile]: { padding: 0 },
  },
});

export const canvas = style({
  background: vars.surface.canvas,
  color: vars.ink,
  fontFamily: vars.font.ui,
  borderRadius: radii["3xl"],
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
  isolation: "isolate",
  display: "flex",
  flexDirection: "column",
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      borderRadius: radii.none,
    },
  },
});

export const contentRow = style({
  position: "relative",
  zIndex: 1,
  display: "flex",
  flex: 1,
  minHeight: 0,
});

export const mainColumn = style({
  // Positioning context for the assistant overlay (assistantSlot).
  position: "relative",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  background: vars.surface.content,
  transition: themeTransition,
  "@media": {
    // Pages collapse their rail grids to a single stacked column at the
    // tablet breakpoint and grow past the viewport, so the column must
    // scroll there too — not just on mobile.
    [media.tablet]: {
      overflow: "auto",
    },
    [media.mobile]: {
      // Top band clears the fixed corner actions (CornerActions, mobile-only);
      // bottom band clears the floating menu.
      paddingTop: 0,
      paddingBottom: space["23"],
      WebkitOverflowScrolling: "touch",
    },
  },
});

export const desktopOnly = style({
  display: "flex",
  "@media": {
    [media.mobile]: { display: "none" },
  },
});

export const mobileOnly = style({
  display: "none",
  "@media": {
    [media.mobile]: { display: "flex", justifyContent: "center" },
  },
});
