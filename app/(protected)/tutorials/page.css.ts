import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii, contentWidth } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { display, text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition, collapseTransition } from "@/lib/theme/transitions";

export const page = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: {
      flex: "0 0 auto",
      minHeight: "auto",
    },
  },
});

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: space["6"],
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
    width: 268,
    minWidth: 0,
    borderRight: `1px solid ${vars.rule}`,
    marginTop: space["2.5"],
    transition: collapseTransition,
    "@media": {
      [media.mobile]: { minHeight: "auto" },
      [media.tablet]: { width: "auto" },
    },
    selectors: {
      [`${page}[data-rail-collapsed="true"] &`]: {
        width: 44,
        "@media": {
          [media.tablet]: { width: "auto" },
        },
      },
      [`${page}[data-no-transitions="true"] &`]: {
        transition: "none",
      },
    },
  },
]);

export const railHeader = style({
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  padding: "0px 8px 4px",
  flexShrink: 0,
  selectors: {
    [`${page}[data-rail-collapsed="true"] &`]: {
      justifyContent: "center",
      paddingBottom: space["1"],
    },
  },
  "@media": {
    [media.tablet]: { display: "none" },
  },
});

export const railToggle = iconBtn();

export const railToggleIcon = style({
  display: "inline-flex",
  color: vars.muted,
  transition: collapseTransition,
  selectors: {
    [`${page}[data-rail-collapsed="true"] &`]: {
      transform: "rotate(180deg)",
    },
    [`${page}[data-no-transitions="true"] &`]: {
      transition: "none",
    },
  },
});

// Pinned to the expanded width so the sections never reflow while the rail
// animates; overflow:hidden on the rail clips it and opacity fades it.
export const railScroll = style({
  display: "flex",
  flexDirection: "column",
  width: 268,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  opacity: 1,
  transition: collapseTransition,
  "@media": {
    [media.tablet]: { width: "auto" },
  },
  selectors: {
    [`${page}[data-rail-collapsed="true"] &`]: {
      opacity: 0,
      pointerEvents: "none",
      "@media": {
        [media.tablet]: { opacity: 1, pointerEvents: "auto" },
      },
    },
    [`${page}[data-no-transitions="true"] &`]: {
      transition: "none",
    },
  },
});

export const railSection = style({
  display: "flex",
  flexDirection: "column",
  padding: "14px 12px 12px",
  borderBottom: `1px solid ${vars.rule}`,
  selectors: {
    "&:last-child": { borderBottom: "none" },
  },
});

export const railSectionHead = style([
  fieldLabel,
  {
    padding: "0 8px 6px",
    transition: themeTransition,
  },
]);

export const railRow = style([
  text.row,
  {
    gap: space["2.5"],
    color: vars.ink,
    background: "transparent",
    border: "1px solid transparent",
    textAlign: "left",
    width: "100%",
  },
]);

export const railRowActive = style({
  background: vars.glass.bgDeep,
  borderColor: vars.glass.stroke,
  fontWeight: 600,
});

export const railRowNumber = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  flexShrink: 0,
  borderRadius: radii.pill,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  fontSize: 10.5,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: vars.muted,
  transition: themeTransition,
  selectors: {
    [`${railRowActive} &`]: {
      background: vars.accent.primary,
      borderColor: vars.accent.primary,
      color: vars.textOnAccent,
    },
  },
});

export const railRowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const mainCard = style([
  cardBase,
  {
    "@media": {
      [media.mobile]: { minHeight: 540, padding: "0 16px" },
    },
  },
]);

export const articleScroll = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarGutter: "stable",
  padding: `${space["2.5"]}px 0 ${space["12"]}px`,
  "@media": {
    [media.mobile]: { padding: `${space["1"]}px 0 ${space["10"]}px` },
  },
});

export const articleInner = style({
  width: "100%",
  maxWidth: contentWidth.sm,
  margin: "0 auto",
  padding: `${space["4"]}px ${space["6"]}px`,
  "@media": {
    [media.mobile]: { padding: `${space["2"]}px 0` },
  },
});

export const articleKicker = style([
  fieldLabel,
  {
    color: vars.accent.primary,
    marginBottom: space["2.5"],
    transition: themeTransition,
  },
]);

export const articleTitle = style([
  display.pageTitle,
  {
    color: vars.ink,
    margin: 0,
    lineHeight: 1.15,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { fontSize: 26 },
    },
  },
]);

export const articleSummary = style([
  text.bodyLg,
  {
    color: vars.muted,
    margin: `${space["2.5"]}px 0 0`,
    lineHeight: 1.5,
    fontWeight: 500,
    transition: themeTransition,
  },
]);

export const articleDivider = style({
  height: 1,
  background: vars.rule,
  margin: `${space["5"]}px 0 ${space["6"]}px`,
  transition: themeTransition,
});

export const pager = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: space["3"],
  marginTop: space["10"],
  paddingTop: space["6"],
  borderTop: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const pagerButton = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: space["1.5"],
  width: "100%",
  minWidth: 0,
  padding: `${space["3.5"]}px ${space["4"]}px`,
  borderRadius: radii.md,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  color: vars.ink,
  cursor: "pointer",
  textAlign: "left",
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
      borderColor: vars.rule,
    },
  },
});

export const pagerButtonNext = style({
  alignItems: "flex-end",
  textAlign: "right",
});

export const pagerDir = style([
  fieldLabel,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["1"],
    color: vars.muted,
  },
]);

export const pagerTitle = style([
  text.body,
  {
    color: vars.ink,
    fontWeight: 600,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  },
]);

// Mobile: a pill naming the current tutorial, opening the picker sheet.
export const scopeRow = style({
  display: "flex",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: `1px solid ${vars.rule}`,
  flexShrink: 0,
});

export const scopePill = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["2"],
  minWidth: 0,
  maxWidth: "100%",
  padding: "8px 14px",
  borderRadius: radii.pill,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  color: vars.ink,
  fontFamily: vars.font.ui,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: themeTransition,
});

export const scopePillLabel = style({
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const scopePillChevron = style({
  display: "inline-flex",
  color: vars.muted,
  flexShrink: 0,
});

export const sheetList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  paddingBottom: space["4"],
});

export const sheetSectionHead = style([
  fieldLabel,
  {
    padding: `${space["3"]}px ${space["2"]}px ${space["1.5"]}px`,
  },
]);

export const sheetRow = style([
  text.bodyLg,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2.5"],
    width: "100%",
    padding: `${space["2.5"]}px ${space["2"]}px`,
    borderRadius: radii.sm,
    border: "none",
    background: "transparent",
    color: vars.ink,
    textAlign: "left",
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
    },
  },
]);

export const sheetRowActive = style({
  background: vars.interactive.selectedFill,
  fontWeight: 600,
});

export const sheetRowNumber = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  flexShrink: 0,
  borderRadius: radii.pill,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  fontSize: 11,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: vars.muted,
  selectors: {
    [`${sheetRowActive} &`]: {
      background: vars.accent.primary,
      borderColor: vars.accent.primary,
      color: vars.textOnAccent,
    },
  },
});
