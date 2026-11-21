import { style, globalStyle, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";
import {
  themeTransition,
  interactiveTransition,
} from "@/lib/theme/transitions";

export const page = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: {
      flex: "0 0 auto",
      minHeight: "auto",
      selectors: {
        // The WeekStructureModal fills this element (absolute inset 0); the
        // mobile rail alone can be shorter than the viewport, which would
        // crush the modal.
        '&[data-windows-open="true"]': {
          minHeight: "100dvh",
        },
      },
    },
  },
});

export const spacer = style({
  flex: 1,
});

export const actionCluster = style({
  display: "flex",
  gap: space["2"],
  flexShrink: 0,
});

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  gap: space["4"],
  padding: "0 28px 28px",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.tablet]: {
      gridTemplateColumns: "1fr",
      flex: "0 0 auto",
      minHeight: "auto",
    },
    [media.mobile]: {
      padding: "0 0 24px",
      gap: space["3.5"],
    },
  },
});

const cardBase = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
});

export const rail = style([
  cardBase,
  {
    border: `1px solid ${vars.rule}`,
    borderRadius: radii["md+2"],
    padding: "12px 8px 8px",
    background: "transparent",
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        minHeight: "auto",
        borderRadius: 0,
        borderLeftWidth: 0,
        borderRightWidth: 0,
      },
    },
  },
]);

export const railHead = style([
  fieldLabel,
  {
    padding: "0 8px 6px",
    transition: themeTransition,
  },
]);

export const railBody = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
});

export const railRow = style([
  text.row,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    padding: "5px 8px",
    borderRadius: radii.sm,
    cursor: "pointer",
    color: vars.ink,
    background: "transparent",
    border: "1px solid transparent",
    transition: themeTransition,
    textAlign: "left",
    width: "100%",
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
      },
    },
    "@media": {
      [media.mobile]: {
        minHeight: 44,
        padding: "8px 8px",
      },
    },
  },
]);

export const railRowActive = style({
  background: vars.glass.bgDeep,
  borderColor: vars.glass.stroke,
  fontWeight: 600,
});

export const railRowDot = style({
  display: "inline-block",
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const railRowNoDot = style({
  display: "inline-block",
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  border: `1px dashed ${vars.muted}`,
  opacity: 0.5,
  flexShrink: 0,
});

export const railRowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const railRowCount = style([
  text.microLabel,
  {
    fontVariantNumeric: "tabular-nums",
    color: vars.muted,
    transition: themeTransition,
  },
]);

// Drop-target visualization, speaking the subtasks draggable's language
// (lumenTasks draggableDropTarget). Folder semantics — no reorder, so no
// divider lines: hovering a row tints it (it'll become the parent), and
// hovering rail space outside any row lights the rail itself as the
// "move to top level" target.
globalStyle(`${railRow}[data-dragging="true"]`, {
  background: vars.glass.bgSoft,
  opacity: 0.4,
  transition: interactiveTransition("background-color", "opacity"),
});

globalStyle(`${railRow}[data-drag-over="true"]`, {
  background: `color-mix(in srgb, ${vars.accent.now} ${colorMixAlpha.hoverFill}%, transparent)`,
  borderColor: `color-mix(in srgb, ${vars.accent.now} 65%, transparent)`,
  transition: interactiveTransition("background-color", "border-color"),
});

globalStyle(`${rail}[data-drag-over-root="true"]`, {
  borderColor: `color-mix(in srgb, ${vars.accent.now} 65%, transparent)`,
  background: `color-mix(in srgb, ${vars.accent.now} ${colorMixAlpha.subtleFill}%, transparent)`,
  transition: interactiveTransition("background-color", "border-color"),
});

// Post-drop landing feedback: the moved row glows at the drop-target tint
// and fades, so it's findable wherever it landed in the tree.
const dropFlash = keyframes({
  "0%": {
    background: `color-mix(in srgb, ${vars.accent.now} ${colorMixAlpha.hoverFill}%, transparent)`,
  },
  "100%": { background: "transparent" },
});

globalStyle(`${railRow}[data-dropped="true"]`, {
  animation: `${dropFlash} 0.7s ease-out`,
});

export const railRowAddChild = style([
  iconBtn({ size: "sm" }),
  {
    color: vars.muted,
    opacity: 0,
    transition: interactiveTransition("opacity", "color", "background-color"),
    selectors: {
      [`${railRow}:hover &`]: { opacity: 1 },
      "&:focus-visible": {
        opacity: 1,
        outline: `1px solid ${vars.accent.primary}`,
      },
    },
    "@media": {
      // No hover to reveal it on touch devices.
      "(hover: none)": {
        opacity: 1,
      },
    },
  },
]);

// Reorder handle, subtasks gripBtn language: hidden until row hover on
// pointer devices, always visible with a bigger hit box on touch. touchAction
// none keeps the browser from claiming the gesture for scrolling.
export const railRowGrip = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 26,
  margin: "-4px 0 -4px -4px",
  flexShrink: 0,
  color: vars.muted,
  opacity: 0,
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  cursor: "grab",
  transition: interactiveTransition("opacity", "color"),
  selectors: {
    [`${railRow}:hover &`]: { opacity: 1 },
    "&:hover": { color: vars.ink },
    "&:active": { cursor: "grabbing" },
  },
  "@media": {
    // No hover to reveal it on touch devices.
    [media.touch]: {
      opacity: 1,
      width: 32,
      height: 32,
      margin: "-6px 0 -6px -8px",
    },
  },
});

// While a grip drag is live: the whole rail reads as grabbing, plain row
// hover fill goes quiet so the lit divider / into-tint is the only signal,
// and stray text selection stays off.
export const railBodyDragActive = style({});

globalStyle(`${railBodyDragActive} ${railRow}`, {
  cursor: "grabbing",
  userSelect: "none",
});

globalStyle(
  `${railBodyDragActive} ${railRow}:hover:not([data-dragging="true"])`,
  {
    background: "transparent",
  },
);

globalStyle(
  `${railBodyDragActive} ${railRow}[data-drag-over="true"], ${railBodyDragActive} ${railRow}[data-drag-over="true"]:hover`,
  {
    background: `color-mix(in srgb, ${vars.accent.now} ${colorMixAlpha.hoverFill}%, transparent)`,
  },
);

globalStyle(`${railBodyDragActive} ${railRowGrip}`, {
  cursor: "grabbing",
});

export const treeChevron = style({
  display: "inline-flex",
  width: 14,
  height: 14,
  alignItems: "center",
  justifyContent: "center",
  color: vars.muted,
  cursor: "pointer",
  borderRadius: radii.xs,
  transition: themeTransition,
  selectors: {
    "&:hover": {
      color: vars.ink,
    },
  },
  "@media": {
    [media.mobile]: {
      width: 26,
      height: 26,
      margin: "-6px 0",
    },
  },
});

export const treeChevronSpacer = style({
  display: "inline-block",
  width: 14,
  "@media": {
    [media.mobile]: {
      width: 26,
    },
  },
});

export const railFooter = style({
  flexShrink: 0,
  marginTop: space["2"],
  paddingTop: space["2"],
  paddingLeft: space["1"],
  paddingRight: space["1"],
  borderTop: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const railNewButton = style({
  width: "100%",
  justifyContent: "center",
  gap: space["1.5"],
  padding: "8px 10px",
  borderRadius: radii.sm,
  border: `1px dashed ${vars.rule}`,
  color: vars.muted,
  selectors: {
    "&:hover": {
      color: vars.ink,
      borderColor: vars.glass.stroke,
      background: vars.interactive.hoverFill,
    },
  },
});

export const mainCard = style([
  cardBase,
  {
    border: `1px solid ${vars.rule}`,
    borderRadius: radii["md+2"],
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        minHeight: 540,
        borderRadius: 0,
        borderLeftWidth: 0,
        borderRightWidth: 0,
      },
    },
  },
]);

export const emptyMain = style([
  text.bodyLg,
  {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "60px 24px",
    color: vars.muted,
    textAlign: "center",
  },
]);

export const errorBanner = style([
  text.bodySm,
  {
    margin: "0 28px 14px",
    padding: "8px 12px",
    borderRadius: radii["sm+2"],
    background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.lightFill}%, transparent)`,
    border: `1px solid ${vars.status.error}`,
    color: vars.status.error,
  },
]);
