import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, contentWidth, media } from "@/lib/theme/scales";
import { CORNER_ACTION_GUTTER } from "@/components/ui/shell/CornerActions/constants";
import { iconBtn } from "@/lib/theme/recipes.css";
import { display, text, caption } from "@/lib/theme/typography.css";
import {
  themeTransition,
  interactiveTransition,
} from "@/lib/theme/transitions";
import { zIndex } from "@/lib/theme/scales";

export const page = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
});

// Mobile-only scroller (desktop content is height-locked and scrolls inside
// each tab instead). Kept above `.page`-anchored overlays (AIDraftModal) so
// they don't scroll away with the content underneath.
export const scrollArea = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "auto",
});

// Desktop: a height-locked frame — back row, title, tabs, and delete dock are
// static; each tab page owns its own scroll region inside tabBodyWrap. Mobile
// drops the lock so the whole page scrolls naturally in scrollArea.
export const innerWrap = style({
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  padding: "20px 56px 28px",
  width: "100%",
  maxWidth: contentWidth.xl,
  marginInline: "auto",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: { padding: "16px 16px 24px", overflow: "visible" },
  },
});

// Portrait mobile reserves the corner-search pill's footprint so the back
// link doesn't sit under it; landscape phones fold the pills into the bottom
// bar (PageHeader precedent), freeing the top again.
export const backRow = style({
  display: "flex",
  alignItems: "center",
  paddingBottom: space["1.5"],
  "@media": {
    [media.mobile]: { paddingLeft: CORNER_ACTION_GUTTER },
    [media.landscapePhone]: { paddingLeft: 0 },
  },
});

export const backLink = style([
  text.bodySm,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["1.5"],
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: vars.muted,
    background: "transparent",
    border: "none",
    padding: "6px 0",
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": { color: vars.ink },
    },
  },
]);

export const titleBlock = style({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: space["6"],
  marginTop: space["3.5"],
  "@media": {
    [media.mobile]: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: space["3.5"],
    },
  },
});

// Shared geometry so display <-> edit doesn't push following content.
const TITLE_LINE_HEIGHT = 56;
const TITLE_BORDER = 2;

export const title = style([
  display.hero,
  {
    lineHeight: `${TITLE_LINE_HEIGHT}px`,
    color: vars.ink,
    margin: 0,
    padding: 0,
    display: "block",
    boxSizing: "content-box",
    borderBottom: `${TITLE_BORDER}px solid transparent`,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { fontSize: 38, lineHeight: "38px" },
    },
  },
]);

// The <Input variant="titleInline"> supplies the accent underline + box reset;
// this layers the hero typography and the height matched to the static title so
// toggling rename in/out doesn't shift layout.
export const titleEditInput = style([
  display.hero,
  {
    lineHeight: `${TITLE_LINE_HEIGHT}px`,
    display: "block",
    height: TITLE_LINE_HEIGHT,
    "@media": {
      [media.mobile]: { fontSize: 38, lineHeight: "38px", height: 38 },
    },
  },
]);

export const titleClickable = style({
  cursor: "text",
  selectors: {
    "&:hover": { opacity: 0.85 },
  },
});

export const editableTitleWrap = style({
  flex: 1,
  minWidth: 0,
});

export const titleHoverRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  minWidth: 0,
});

export const renamePencil = style([
  iconBtn(),
  {
    alignSelf: "flex-start",
    marginTop: space["1"],
    opacity: 0,
    transition: interactiveTransition("opacity", "color", "background-color"),
    selectors: {
      [`${titleHoverRow}:hover &`]: { opacity: 1 },
    },
  },
]);

export const headActions = style({
  display: "flex",
  gap: space["4"],
  flexShrink: 0,
  alignItems: "flex-end",
});

export const readyCluster = style({
  position: "relative",
  minWidth: 124,
});

export const readyHint = style([
  caption,
  {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    lineHeight: 1.35,
    textAlign: "center",
  },
]);

export const headActionsCluster = style({
  display: "flex",
  gap: space["2"],
  alignItems: "center",
});

export const tabBodyWrap = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: { flex: "1 0 auto" },
  },
});

// Pinned to the frame bottom on desktop (the height-locked innerWrap plus
// marginTop auto); flows after the content on mobile's natural page scroll.
// The negative bottom margin mirrors innerWrap's bottom padding so the dock
// sits flush with the scrollport edge instead of floating 28px above it.
export const deleteDock = style({
  marginTop: "auto",
  marginBottom: `-${space["7"]}px`,
  backgroundColor: vars.surface.content,
  flexShrink: 0,
  zIndex: zIndex.docked,
  borderTop: `1px solid ${vars.rule}`,
  paddingTop: space["2.5"],
  paddingBottom: space["2.5"],
  transition: themeTransition,
  "@media": {
    [media.mobile]: { marginBottom: `-${space["6"]}px` },
  },
});
