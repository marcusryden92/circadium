import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { text, caption } from "@/lib/theme/typography.css";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  padding: "4px 0",
});

export const memberRow = style([
  text.row,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2.5"],
    padding: "8px 10px",
    borderRadius: radii.sm,
    color: vars.ink,
    background: "transparent",
    border: "1px solid transparent",
    transition: themeTransition,
    width: "100%",
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
      },
    },
  },
]);

globalStyle(`${memberRow}[data-dragging="true"]`, {
  opacity: 0.4,
});

globalStyle(`${memberRow}[data-drag-over="before"]`, {
  boxShadow: `inset 0 2px 0 0 ${vars.accent.primary}`,
});

globalStyle(`${memberRow}[data-drag-over="after"]`, {
  boxShadow: `inset 0 -2px 0 0 ${vars.accent.primary}`,
});

export const orderNumber = style([
  text.microLabel,
  {
    width: 18,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: vars.muted,
    flexShrink: 0,
  },
]);

export const memberTitle = style({
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const memberTitleLink = style({
  color: "inherit",
  textDecoration: "none",
  selectors: {
    "&:hover": { textDecoration: "underline" },
  },
});

export const memberHint = style([
  text.microLabel,
  {
    color: vars.muted,
    fontStyle: "italic",
    flexShrink: 0,
  },
]);

export const inheritedBadge = style({
  opacity: 0.55,
});

export const memberSpacer = style({
  flex: 1,
});

export const memberDuration = style([
  text.microLabel,
  {
    fontVariantNumeric: "tabular-nums",
    color: vars.muted,
    flexShrink: 0,
  },
]);

export const memberRemove = style([
  iconBtn({ size: "sm" }),
  {
    color: vars.muted,
    opacity: 0,
    transition: interactiveTransition("opacity", "color", "background-color"),
    selectors: {
      [`${memberRow}:hover &`]: { opacity: 1 },
      "&:focus-visible": {
        opacity: 1,
        outline: `1px solid ${vars.accent.primary}`,
      },
    },
  },
]);

export const emptyNote = style([
  text.bodySm,
  {
    padding: "18px 10px",
    color: vars.muted,
    textAlign: "center",
  },
]);

export const historyToggle = style([
  caption,
  {
    alignSelf: "flex-start",
    padding: "4px 10px",
    margin: 0,
    border: "none",
    background: "transparent",
    borderRadius: radii.sm,
    color: vars.muted,
    cursor: "pointer",
    transition: interactiveTransition("color", "background-color"),
    selectors: {
      "&:hover": {
        color: vars.inkSoft,
        background: vars.interactive.hoverFill,
      },
    },
  },
]);

export const historyPanel = style({
  maxHeight: 220,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  paddingBottom: space["1.5"],
  marginBottom: space["1.5"],
  borderBottom: `1px solid ${vars.rule}`,
});

export const historyRow = style([
  text.row,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2.5"],
    padding: "6px 10px",
    borderRadius: radii.sm,
    color: vars.muted,
    transition: themeTransition,
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
      },
    },
  },
]);

export const historyDate = style([
  text.microLabel,
  {
    fontVariantNumeric: "tabular-nums",
    color: vars.muted,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
]);

export const historyRemove = style([
  iconBtn({ size: "sm" }),
  {
    color: vars.muted,
    opacity: 0,
    transition: interactiveTransition("opacity", "color", "background-color"),
    selectors: {
      [`${historyRow}:hover &`]: { opacity: 1 },
      "&:focus-visible": {
        opacity: 1,
        outline: `1px solid ${vars.accent.primary}`,
      },
    },
  },
]);
