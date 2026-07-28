import { style } from "@vanilla-extract/css";
import {
  iconBtn,
  media,
  radii,
  space,
  statusTag,
  text,
  themeTransition,
  vars,
} from "@/lib/theme";

// Scrolls inside the height-locked tab frame on desktop; natural flow on
// mobile where the whole page scrolls instead.
export const root = style({
  paddingTop: space["3"],
  display: "flex",
  flexDirection: "column",
  gap: space["7"],
  flex: "1 1 0%",
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  "@media": {
    [media.mobile]: {
      flex: "1 0 auto",
      minHeight: "auto",
      overflowY: "visible",
      scrollbarGutter: "auto",
    },
  },
});

export const engineHeader = style({
  padding: "0 0 14px",
  flexShrink: 0,
  marginTop: space["3.5"],
  marginBottom: space["3.5"],
  display: "flex",
  justifyContent: "space-between",
  gap: space["1"],
});

export const engineLastRun = style([
  text.microLabel,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const engineSummary = style([
  text.label,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const engineList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2.5"],
  minHeight: 0,
  flex: 1,
  overflowY: "auto",
  paddingRight: space["1"],
});

// Divider-row toggle for the dismissed-messages section at the tail of the
// list; the dismissed cards render dimmed beneath it with a restore action.
export const engineDismissedToggle = style([
  text.microLabel,
  {
    alignSelf: "flex-start",
    marginTop: space["1"],
    padding: "4px 0",
    border: "none",
    background: "transparent",
    color: vars.muted,
    cursor: "pointer",
    transition: themeTransition,
    ":hover": {
      color: vars.inkSoft,
    },
  },
]);

export const engineCardDismissed = style({
  opacity: 0.55,
});

export const engineCard = style({
  position: "relative",
  padding: "10px 12px",
  borderRadius: radii["sm+2"],
  border: `1px solid ${vars.rule}`,
  background: "transparent",
  transition: themeTransition,
});

// Whole-card link overlay when the payload references a planner. Sits under
// the dismiss button so a click on × doesn't accidentally navigate.
export const engineCardLink = style({
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  color: "transparent",
  textDecoration: "none",
  cursor: "pointer",
  zIndex: 0,
  ":focus-visible": {
    outline: `2px solid ${vars.accent.primary}`,
    outlineOffset: 2,
  },
});

// Card content sits above the link overlay so text remains selectable and
// the dismiss button remains clickable.
export const engineCardContent = style({
  position: "relative",
  zIndex: 1,
  pointerEvents: "none",
});

// `pointer-events: auto` restores clickability against the parent's
// disabled events set on engineCardContent.
const engineCardActionBtn = style([
  iconBtn({ size: "sm" }),
  {
    position: "absolute",
    top: 6,
    zIndex: 2,
    pointerEvents: "auto",
    opacity: 0.65,
    ":hover": {
      opacity: 1,
    },
    ":focus-visible": {
      outline: `2px solid ${vars.accent.primary}`,
      outlineOffset: 1,
    },
  },
]);

export const engineDismissBtn = style([engineCardActionBtn, { right: 6 }]);

export const engineGoToBtn = style([engineCardActionBtn, { right: 32 }]);

export const engineCardHead = style({
  display: "flex",
  alignItems: "flex-start",
  gap: space["2"],
  flexWrap: "wrap",
  // Reserve space for the absolute-positioned buttons in the top-right
  // corner (dismiss + optional go-to) so a long title wraps before it slides
  // under either. Sized for both buttons; cards without a go-to have a bit
  // of extra breathing room, which reads consistently.
  paddingRight: space["12"],
});

export const engineTag = style([
  statusTag,
  {
    padding: "2px 8px",
    borderRadius: radii.pill,
    color: vars.textOnAccent,
  },
]);

export const engineCardTitle = style([
  text.row,
  {
    color: vars.ink,
    lineHeight: 1.25,
    flex: 1,
    minWidth: 0,
    transition: themeTransition,
  },
]);

export const engineCardBody = style([
  text.label,
  {
    color: vars.inkSoft,
    marginTop: space["1.5"],
    lineHeight: 1.45,
    transition: themeTransition,
  },
]);
