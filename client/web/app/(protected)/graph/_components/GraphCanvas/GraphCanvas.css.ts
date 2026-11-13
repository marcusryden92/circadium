import { style, globalStyle, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { text, caption, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition, interactiveTransition, DURATIONS } from "@/lib/theme/transitions";

export const scroller = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  position: "relative",
});

// Touch mode: the app owns single-finger pan and pinch, so suppress native
// scroll/gestures — otherwise a touch-drag on a pill races native scroll and
// cancels the reorder/link nondeterministically.
globalStyle(`${scroller}[data-touch="true"]`, {
  touchAction: "none",
});

export const AXIS_HEIGHT = 30;

export const axis = style({
  position: "sticky",
  top: 0,
  zIndex: 5,
  height: AXIS_HEIGHT,
  // surface.content, not paper: dark-mode paper is darker than the page
  // surface, so a paper-filled sticky header reads as a dark band.
  background: vars.surface.content,
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const axisTick = style([
  caption,
  {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    paddingLeft: space["1"],
    whiteSpace: "nowrap",
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    fontSize: 9.5,
    fontWeight: 400,
  },
]);

globalStyle(`${axisTick}[data-emphasized="true"]`, {
  color: vars.inkSoft,
});

export const axisDockLabel = style([
  caption,
  {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    paddingLeft: space["1"],
    whiteSpace: "nowrap",
    color: vars.muted,
    fontStyle: "italic",
  },
]);

export const content = style({
  position: "relative",
});

export const svgLayer = style({
  position: "absolute",
  left: 0,
  top: 0,
  pointerEvents: "none",
});

export const edgeHit = style({
  pointerEvents: "stroke",
  cursor: "pointer",
});

const edgeFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

// The delay hides the transient broken-chain flash between a drop and its regen.
export const edgeGroup = style({
  animation: `${edgeFadeIn} ${DURATIONS.interactive}s ease ${DURATIONS.interactive}s both`,
});

export const lane = style({
  position: "relative",
});

export const laneHead = style({
  position: "sticky",
  left: 8,
  zIndex: 3,
  display: "inline-flex",
  alignItems: "center",
  gap: space["2"],
  height: 26,
  paddingTop: space["1.5"],
});

// Distinguishes a queue lane from a same-named category heading.
export const laneQueueCaption = style({
  opacity: 0.55,
});

export const laneTitle = style([
  fieldLabel,
  {
    whiteSpace: "nowrap",
    transition: themeTransition,
  },
]);

export const laneCount = style([
  caption,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
]);

const nodeMotion = `transform ${DURATIONS.collapse}s ease, opacity ${DURATIONS.collapse}s ease`;
const nodeReflow = `left ${DURATIONS.collapse}s ease, top ${DURATIONS.collapse}s ease, width ${DURATIONS.collapse}s ease`;

export const node = style([
  text.row,
  {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    borderRadius: radii.pill,
    background: vars.tileFill,
    border: `1px solid ${vars.rule}`,
    color: vars.ink,
    zIndex: 2,
    userSelect: "none",
    transition: `${nodeMotion}, ${nodeReflow}, ${themeTransition}`,
    selectors: {
      "&:hover": {
        borderColor: vars.glass.stroke,
      },
    },
  },
]);

globalStyle(`${content}[data-zooming="true"] ${node}`, {
  transition: `${nodeMotion}, ${themeTransition}`,
});

globalStyle(`${node}[data-completed="true"]`, {
  opacity: 0.55,
});

globalStyle(`${node}[data-docked="true"]`, {
  borderStyle: "dashed",
  background: "transparent",
});

// The grabbed node follows the pointer — any easing would trail the cursor.
globalStyle(`${node}[data-drag-active="true"]`, {
  zIndex: 6,
  boxShadow: vars.shadow.panelSm,
  pointerEvents: "none",
  transition: themeTransition,
});

// Dropped — easing back on so it slides from the cursor into the slot.
globalStyle(`${node}[data-settling="true"]`, {
  zIndex: 6,
});

// Leaf-view group: root pill above, grouping brace, leaf pills below. The
// container is transparent and pointer-inert; pills re-enable events.
export const band = style({
  position: "absolute",
  zIndex: 2,
  pointerEvents: "none",
  transition: `${nodeMotion}, ${nodeReflow}, ${themeTransition}`,
});

globalStyle(`${content}[data-zooming="true"] ${band}`, {
  transition: `${nodeMotion}, ${themeTransition}`,
});

globalStyle(`${band} > ${node}`, {
  pointerEvents: "auto",
});

globalStyle(`${band}[data-drag-active="true"]`, {
  zIndex: 6,
  transition: themeTransition,
});

globalStyle(`${band}[data-drag-active="true"] > ${node}`, {
  pointerEvents: "none",
  boxShadow: vars.shadow.panelSm,
});

globalStyle(`${band}[data-settling="true"]`, {
  zIndex: 6,
});

export const bandBrace = style({
  position: "absolute",
  borderLeft: `1px solid ${vars.rule}`,
  borderRight: `1px solid ${vars.rule}`,
  borderTop: `1px solid ${vars.rule}`,
  borderRadius: "5px 5px 0 0",
  pointerEvents: "none",
  selectors: {
    "&::before": {
      content: '""',
      position: "absolute",
      left: "50%",
      top: -4,
      width: 1,
      height: 4,
      background: vars.rule,
    },
  },
});

globalStyle(`${node}[data-link-target="valid"]`, {
  borderColor: vars.accent.primary,
  boxShadow: `0 0 0 1px ${vars.accent.primary}`,
});

globalStyle(`${node}[data-link-target="invalid"]`, {
  borderColor: vars.status.error,
  boxShadow: `0 0 0 1px ${vars.status.error}`,
});

export const nodeLink = style({
  display: "flex",
  alignItems: "center",
  minWidth: 0,
  width: "100%",
  height: "100%",
  padding: "0 10px",
  borderRadius: radii.pill,
  color: "inherit",
  textDecoration: "none",
});

globalStyle(`${node}[data-draggable="true"] ${nodeLink}`, {
  cursor: "grab",
});

globalStyle(
  `${scroller}[data-reordering="true"], ${scroller}[data-reordering="true"] *`,
  {
    cursor: "grabbing",
  },
);

// Marks the landing anchor while a member is being dragged or settling.
export const dropSlot = style({
  position: "absolute",
  borderRadius: radii.pill,
  border: `1.5px dashed ${vars.accent.primary}`,
  background: `color-mix(in srgb, ${vars.accent.primary} 6%, transparent)`,
  opacity: 0.65,
  pointerEvents: "none",
  zIndex: 1,
  transition: nodeReflow,
});

export const nodeTitle = style({
  fontSize: "inherit",
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  selectors: {
    "&:hover": { textDecoration: "underline" },
  },
});

export const nodeInitial = style({
  fontSize: "inherit",
  fontWeight: 600,
  lineHeight: 1,
  textAlign: "center",
});

export const nodeNameBadge = style({
  position: "absolute",
  zIndex: 4,
  display: "flex",
  flexDirection: "column",
  gap: space.px,
  transform: "translateX(-50%)",
  padding: "5px 11px",
  borderRadius: radii["sm+2"],
  background: vars.paper,
  border: `1px solid ${vars.glass.stroke}`,
  boxShadow: vars.shadow.panelSm,
  color: vars.ink,
  maxWidth: 320,
  pointerEvents: "none",
});

export const nodeNameBadgeTitle = style({
  fontSize: 12,
  fontWeight: 550,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const nodeNameBadgeMeta = style([
  caption,
  {
    color: vars.muted,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
]);

// Touch: the badge is pointer-inert, but its Open action re-enables events and
// navigates to the item (a bare pill tap only selects on touch).
export const nodeBadgeOpen = style({
  marginTop: space["1"],
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  minHeight: 32,
  padding: `0 ${space["2.5"]}px`,
  borderRadius: radii.pill,
  background: vars.ink,
  color: vars.paper,
  fontSize: 11,
  fontWeight: 600,
  textDecoration: "none",
  pointerEvents: "auto",
});

export const nodeHint = style([
  caption,
  {
    marginLeft: space["1.5"],
    color: vars.muted,
    fontStyle: "italic",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
]);

const linkHandleBase = style({
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 14,
  height: 14,
  padding: 0,
  borderRadius: radii.pill,
  border: `1.5px solid ${vars.muted}`,
  background: vars.paper,
  cursor: "crosshair",
  opacity: 0,
  // Hidden handles never intercept a pointer (a touch near the pill edge would
  // otherwise grab an invisible handle); revealing them re-enables events.
  pointerEvents: "none",
  zIndex: 3,
  touchAction: "none",
  transition: interactiveTransition("opacity", "border-color"),
  selectors: {
    [`${node}:hover &`]: { opacity: 1, pointerEvents: "auto" },
    [`${node}[data-selected="true"] &`]: { opacity: 1, pointerEvents: "auto" },
    "&:hover": { borderColor: vars.accent.primary },
    "&:focus-visible": {
      opacity: 1,
      pointerEvents: "auto",
      outline: `1px solid ${vars.accent.primary}`,
    },
  },
});

export const linkHandleOut = style([linkHandleBase, { right: -7 }]);

export const linkHandleIn = style([linkHandleBase, { left: -7 }]);

// A tap-selected node (touch) enlarges its handles into a comfortable target.
globalStyle(`${node}[data-selected="true"] ${linkHandleOut}`, {
  width: 22,
  height: 22,
  right: -11,
});
globalStyle(`${node}[data-selected="true"] ${linkHandleIn}`, {
  width: 22,
  height: 22,
  left: -11,
});

export const linkReasonChip = style([
  caption,
  {
    position: "absolute",
    zIndex: 4,
    padding: "3px 8px",
    borderRadius: radii.pill,
    background: vars.paper,
    border: `1px solid ${vars.status.error}`,
    color: vars.status.error,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
]);

export const edgeChip = style([
  text.bodySm,
  {
    position: "absolute",
    zIndex: 4,
    display: "flex",
    alignItems: "center",
    gap: space["1.5"],
    padding: "4px 6px 4px 10px",
    borderRadius: radii.pill,
    background: vars.paper,
    border: `1px solid ${vars.glass.stroke}`,
    boxShadow: vars.shadow.panelSm,
    color: vars.ink,
    transform: "translate(-50%, -50%)",
    whiteSpace: "nowrap",
    maxWidth: 340,
  },
]);

export const edgeChipLabel = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
});

export const edgeChipRemove = style([
  iconBtn({ size: "sm" }),
  {
    color: vars.muted,
    flexShrink: 0,
    selectors: {
      "&:hover": { color: vars.status.error },
    },
    "@media": {
      [media.touch]: { width: 40, height: 40 },
    },
  },
]);

export const emptyLaneNote = style([
  caption,
  {
    color: vars.muted,
    fontStyle: "italic",
    whiteSpace: "nowrap",
  },
]);
