import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { progressTrack as progressTrackRecipe } from "@/lib/theme/recipes.css";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import {
  themeTransition,
  interactiveTransition,
} from "@/lib/theme/transitions";

const lockedShake = keyframes({
  "0%, 100%": { transform: "translateX(0)" },
  "20%, 60%": { transform: "translateX(-3px)" },
  "40%, 80%": { transform: "translateX(3px)" },
});

export const progressBlock = style({
  paddingTop: space["5"],
  paddingBottom: space["5"],
  height: 60,
  flexShrink: 0,
  overflow: "hidden",
  // The completion row wraps to two lines on narrow screens; the fixed
  // desktop height would clip the wrapped date picker.
  "@media": {
    [media.mobile]: { height: "auto", minHeight: 60 },
  },
});

// Split-task variant: the completed-time inputs are taller than a text line,
// so the block trades top padding for row height to stay inside the fixed 60.
export const progressBlockTight = style({
  paddingTop: space["2.5"],
});

// Completed-time editor + "of Xh · pct%" meta on one line, track below.
export const splitProgressRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
});

export const splitProgressTrack = style([
  progressTrackRecipe({ size: "lg" }),
  {
    marginTop: space["2"],
    transition: themeTransition,
  },
]);

export const progressMeta = style([
  text.body,
  {
    lineHeight: 1,
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const progressMetaStrong = style({
  color: vars.ink,
  fontWeight: 600,
});

export const progressTrack = style([
  progressTrackRecipe({ size: "lg" }),
  {
    marginTop: space["2.5"],
    transition: themeTransition,
  },
]);

export const progressFill = style({
  position: "absolute",
  inset: 0,
  borderRadius: radii.pill,
});

// Task completion row â€” sized to match the left column of overviewGrid (50%
// minus half the 48px gap) so the checkbox lines up with IdentityCard's left
// edge. justify-content puts the checkbox+label cluster on the left and the
// date picker on the right edge of that span. Drops to full width on mobile
// to match overviewGrid's 1-column layout.
export const completeRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["2.5"],
  height: "100%",
  width: "calc(50% - 24px)",
  "@media": {
    [media.laptop]: { width: "100%" },
    [media.mobile]: { flexWrap: "wrap", height: "auto" },
  },
});

export const completeLeftGroup = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
});

export const completeCheckbox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: radii.pill,
  border: `1.5px solid ${vars.muted}`,
  background: "transparent",
  color: vars.muted,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
  transition: interactiveTransition(
    "background-color",
    "border-color",
    "color",
  ),
  selectors: {
    "&[data-completed='true']": {
      background: vars.status.success,
      borderColor: vars.status.success,
      color: vars.paper,
    },
    "&:hover": { borderColor: vars.ink },
    "&[data-completed='true']:hover": {
      borderColor: vars.status.success,
      filter: "brightness(0.95)",
    },
    "&[data-locked='true']": { cursor: "not-allowed" },
    "&[data-shake='true']": {
      animation: `${lockedShake} 0.4s ease-in-out`,
      borderColor: vars.status.error,
      color: vars.status.error,
      background: "transparent",
    },
  },
});

export const completeLabel = style([
  fieldLabel,
  {
    flexShrink: 0,
  },
]);

export const completeDateWrap = style({
  width: 250,
  maxWidth: "100%",
  // Fluid on mobile: fills the remaining row space, and wraps to its own
  // full-width line when less than the basis is left next to the label.
  "@media": {
    [media.mobile]: { width: "auto", flex: "1 1 220px" },
  },
});

export const completeDateWrapFaded = style({
  opacity: 0.4,
  transition: "opacity 160ms ease",
});

// Fills the tab body so the delete dock can pin to the bottom edge — the
// dock's position depends only on viewport/content height, never on what the
// rule popovers or connection groups are doing.
export const overviewRoot = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: { flex: "1 0 auto" },
  },
});

// The one scrolling region of the overview tab on desktop: title, tabs,
// progress block, and delete dock stay fixed while both card columns scroll
// together. On mobile the whole page scrolls instead (scrollArea), so the
// grid reverts to natural flow. Two columns need the full desktop band —
// below `laptop` the content column is too narrow for side-by-side field
// grids (pickers truncate), so it collapses early.
export const overviewGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: space["12"],
  flex: "1 1 0%",
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  paddingBottom: space["4"],
  "@media": {
    [media.laptop]: { gridTemplateColumns: "1fr", gap: space["6"] },
    [media.mobile]: {
      flex: "0 0 auto",
      minHeight: "auto",
      overflowY: "visible",
      scrollbarGutter: "auto",
    },
  },
});

export const leftCol = style({
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
  minWidth: 0,
});

export const rightCol = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});
