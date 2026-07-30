import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex } from "@/lib/theme/scales";
import { popover, iconBtn } from "@/lib/theme/recipes.css";
import { display, text } from "@/lib/theme/typography.css";
import { backdropFilters } from "@/lib/theme/effects";
import {
  themeTransition,
  interactiveTransition,
} from "@/lib/theme/transitions";

const FADE_MS = 160;

// ---- Instances list (Schedule tab) ---------------------------------------

export const list = style({
  display: "flex",
  flexDirection: "column",
});

export const instanceRow = style({
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  gap: space["3"],
  alignItems: "center",
  padding: "10px 20px 10px 12px",
  borderTop: `1px solid ${vars.rule}`,
  transition: themeTransition,
  selectors: {
    "&:last-child": { borderBottom: `1px solid ${vars.rule}` },
  },
});

// Goal rows are clickable (open the completion modal at that period).
export const instanceRowButton = style([
  instanceRow,
  {
    width: "100%",
    background: "transparent",
    border: "none",
    borderTop: `1px solid ${vars.rule}`,
    cursor: "pointer",
    textAlign: "left",
    borderRadius: 0,
    transition: interactiveTransition("background-color"),
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
      "&:last-child": { borderBottom: `1px solid ${vars.rule}` },
    },
  },
]);

export const periodLabel = style([
  text.row,
  {
    color: vars.ink,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
]);

export const statusPill = style([
  text.microLabel,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["1.5"],
    paddingInline: space["2"],
    height: 20,
    borderRadius: radii.pill,
    fontWeight: 600,
    whiteSpace: "nowrap",
    selectors: {
      "&[data-status='completed']": {
        background: `color-mix(in srgb, ${vars.status.success} 16%, transparent)`,
        color: vars.status.success,
      },
      "&[data-status='missed']": {
        background: `color-mix(in srgb, ${vars.status.error} 14%, transparent)`,
        color: vars.status.error,
      },
      "&[data-status='pending']": {
        background: vars.interactive.selectedFill,
        color: vars.inkSoft,
      },
      "&[data-status='upcoming']": {
        background: `color-mix(in srgb, ${vars.ink} 6%, transparent)`,
        color: vars.muted,
      },
    },
  },
]);

// Chevron on clickable goal instance rows (open the completion modal).
export const rowChevron = style({
  color: vars.muted,
  flexShrink: 0,
});

// Round check toggle — matches the item-detail completion checkbox.
export const checkbox = style({
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
  },
});

export const empty = style([
  text.body,
  {
    color: vars.inkSoft,
    padding: "12px 0",
    transition: themeTransition,
  },
]);

// ---- Entry-point banner (recurring-goal subtasks view) -------------------

export const banner = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  padding: space["2.5"],
  marginBottom: space["3"],
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const bannerLeft = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  minWidth: 0,
});

export const bannerIcon = style({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  color: vars.inkSoft,
});

export const bannerText = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  minWidth: 0,
});

export const bannerTitle = style([
  text.row,
  { color: vars.ink, fontWeight: 600 },
]);

export const bannerHint = style([
  text.bodySm,
  {
    color: vars.muted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
]);

// ---- Completion modal (recurring goals) ----------------------------------

export const overlay = style({
  position: "fixed",
  inset: 0,
  background: vars.overlay,
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  zIndex: zIndex.modal,
  opacity: 0,
  transition: `opacity ${FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": { opacity: 1 },
  },
});

export const modal = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    // The `modal` tier, deliberately below the DateTimePicker panel's
    // `modalOver` — a completion time picker opened inside must render on top.
    zIndex: zIndex.modal,
    top: "50%",
    left: "50%",
    width: "min(680px, calc(100vw - 32px))",
    height: "min(74vh, 540px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
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
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: space["3"],
  padding: "18px 22px 14px",
  borderBottom: `1px solid ${vars.rule}`,
  flexShrink: 0,
});

export const headerText = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  minWidth: 0,
});

export const title = style([
  display.modalTitle,
  { color: vars.ink, margin: 0 },
]);

export const subtitle = style([text.bodySm, { color: vars.muted }]);

export const closeBtn = style([
  iconBtn(),
  { color: vars.muted, flexShrink: 0 },
]);

export const columns = style({
  display: "flex",
  flex: 1,
  minHeight: 0,
});

export const instanceListCol = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  width: 240,
  flexShrink: 0,
  padding: space["3"],
  overflow: "auto",
  borderRight: `1px solid ${vars.rule}`,
});

export const instanceListRow = style([
  text.bodySm,
  {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: space["2"],
    padding: "8px 10px",
    width: "100%",
    borderRadius: radii["sm+2"],
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: interactiveTransition("background-color", "border-color"),
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
      "&[data-active='true']": {
        background: vars.interactive.selectedFill,
        borderColor: vars.glass.stroke,
      },
    },
  },
]);

export const instanceListLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 600,
});

export const panel = style({
  flex: 1,
  minWidth: 0,
  overflow: "auto",
  padding: space["4"],
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
});

export const panelHeading = style([
  text.microLabel,
  {
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    paddingBottom: space["2"],
    marginBottom: space["2"],
    borderBottom: `1px solid ${vars.rule}`,
  },
]);

export const treeRow = style({
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: space["3"],
  padding: "7px 0",
  minHeight: 34,
});

export const treeRowActions = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: space["2"],
  minWidth: 0,
});

export const treeName = style([
  text.row,
  {
    color: vars.ink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
]);

export const treeNameParent = style([
  treeName,
  { color: vars.inkSoft, fontWeight: 600 },
]);

export const rollup = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
]);

export const modalEmpty = style([
  text.bodySm,
  {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: vars.muted,
    padding: space["6"],
  },
]);
