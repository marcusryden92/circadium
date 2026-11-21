import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text, fieldLabel, statusTag } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const wrap = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  borderRadius: radii["md+2"],
  border: `1px solid ${vars.rule}`,
  background: vars.paper,
  padding: space["2.5"],
  transition: themeTransition,
  // Opt back in from the global user-select: none — goal titles and fields
  // should be copyable.
  userSelect: "text",
});

export const empty = style([
  text.bodySm,
  {
    padding: space["6"],
    color: vars.muted,
    textAlign: "center",
  },
]);

export const nodeBlock = style({
  display: "flex",
  flexDirection: "column",
});

// Collapsible goal header <button>. Emitted BEFORE the status `row` variants
// so their borderLeft/background/padding win over these UA resets; this class
// only contributes the reset, cursor, and header-weight tweaks.
export const goalRow = style({
  appearance: "none",
  background: "transparent",
  border: "none",
  width: "100%",
  textAlign: "left",
  font: "inherit",
  cursor: "pointer",
});

const rowBase = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["2.5"],
  padding: "4px 8px",
  minWidth: 0,
  borderRadius: radii.sm,
  borderLeft: `2px solid transparent`,
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
  },
});

// Status-specific row treatments. Each variant gets a colored left border
// (matches the drag-and-drop indent border language) and a subtle background
// tint so the change stands out without becoming loud.
export const row = styleVariants({
  unchanged: [rowBase],
  modified: [
    rowBase,
    {
      borderLeftColor: vars.status.warning,
      background: `color-mix(in srgb, ${vars.status.warning} 8%, transparent)`,
    },
  ],
  added: [
    rowBase,
    {
      borderLeftColor: vars.status.success,
      background: `color-mix(in srgb, ${vars.status.success} 8%, transparent)`,
    },
  ],
  deleted: [
    rowBase,
    {
      borderLeftColor: vars.status.error,
      background: `color-mix(in srgb, ${vars.status.error} 8%, transparent)`,
      opacity: 0.7,
    },
  ],
});

const titleBase = style([
  text.bodySm,
  {
    color: vars.ink,
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    transition: themeTransition,
  },
]);

export const title = styleVariants({
  unchanged: [titleBase],
  modified: [titleBase],
  added: [titleBase],
  deleted: [
    titleBase,
    {
      textDecoration: "line-through",
      textDecorationThickness: 1.5,
      color: vars.muted,
    },
  ],
});

const statusBadgeBase = style([
  statusTag,
  {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    borderRadius: radii.pill,
    flexShrink: 0,
  },
]);

export const statusBadge = styleVariants({
  unchanged: [{ display: "none" }],
  modified: [
    statusBadgeBase,
    {
      color: vars.status.warning,
      border: `1px solid color-mix(in srgb, ${vars.status.warning} 45%, transparent)`,
    },
  ],
  added: [
    statusBadgeBase,
    {
      color: vars.status.success,
      border: `1px solid color-mix(in srgb, ${vars.status.success} 45%, transparent)`,
    },
  ],
  deleted: [
    statusBadgeBase,
    {
      color: vars.status.error,
      border: `1px solid color-mix(in srgb, ${vars.status.error} 45%, transparent)`,
    },
  ],
});

export const metaCluster = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  flexShrink: 0,
});

export const duration = style([
  text.microLabel,
  {
    fontWeight: 600,
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const deadline = style([
  text.microLabel,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
  },
]);

export const metaSep = style({
  color: vars.rule,
  fontSize: 11,
});

export const readyDot = style({
  width: 6,
  height: 6,
  borderRadius: radii.pill,
  background: vars.status.success,
  display: "inline-block",
});

export const changedFields = style({
  fontFamily: vars.font.ui,
  fontSize: 10,
  color: vars.muted,
  fontStyle: "italic",
  flexShrink: 0,
});

// Left-indent border matches the drag-and-drop nested list convention.
export const childrenWrap = style({
  marginLeft: space["3"],
  paddingLeft: space["2.5"],
  borderLeft: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const goalBlock = style({
  display: "flex",
  flexDirection: "column",
  selectors: {
    "& + &": {
      marginTop: space["1.5"],
    },
  },
});

export const goalTitle = style({
  fontSize: 13,
  fontWeight: 600,
});

export const chevron = style({
  flexShrink: 0,
  color: vars.inkSoft,
  transition: `transform 140ms ease, ${themeTransition}`,
  selectors: {
    "&[data-expanded='true']": {
      transform: "rotate(90deg)",
    },
  },
});

export const categoryGroup = style({
  display: "flex",
  flexDirection: "column",
  selectors: {
    "& + &": {
      marginTop: space["3"],
    },
  },
});

export const categoryGroupHeader = style([
  fieldLabel,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    padding: "2px 8px 4px",
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);
