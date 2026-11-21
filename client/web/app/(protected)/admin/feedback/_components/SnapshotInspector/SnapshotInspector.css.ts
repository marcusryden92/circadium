import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const inspector = style({
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
  padding: "14px 18px 20px",
});

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const sectionHead = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

export const overviewGrid = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space["2"],
});

export const statChip = style([
  text.bodySm,
  {
    padding: "4px 10px",
    borderRadius: radii.pill,
    border: `1px solid ${vars.rule}`,
    color: vars.inkSoft,
    whiteSpace: "nowrap",
  },
]);

export const treeRoot = style({
  border: `1px solid ${vars.rule}`,
  borderRadius: radii.sm,
  padding: "2px 10px",
  transition: themeTransition,
});

globalStyle(`${treeRoot} > summary`, {
  cursor: "pointer",
  listStyle: "none",
  padding: "6px 0",
});

globalStyle(`${treeRoot} > summary::-webkit-details-marker`, {
  display: "none",
});

export const rootSummaryRow = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["2"],
  flexWrap: "wrap",
});

export const rootTitle = style([
  text.row,
  {
    color: vars.ink,
  },
]);

export const chip = style([
  text.microLabel,
  {
    padding: "1px 7px",
    borderRadius: radii.pill,
    border: `1px solid ${vars.rule}`,
    color: vars.muted,
    whiteSpace: "nowrap",
  },
]);

export const chipAccent = style([
  chip,
  {
    color: vars.accent.primary,
    borderColor: `color-mix(in srgb, ${vars.accent.primary} 40%, transparent)`,
  },
]);

export const childList = style({
  display: "flex",
  flexDirection: "column",
  padding: "2px 0 8px",
});

export const nodeRow = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["2"],
  flexWrap: "wrap",
  padding: "3px 0",
});

export const nodeTitle = style([
  text.bodySm,
  {
    color: vars.ink,
  },
]);

export const plainRow = style([
  text.bodySm,
  {
    display: "flex",
    alignItems: "baseline",
    gap: space["2"],
    flexWrap: "wrap",
    color: vars.inkSoft,
    padding: "2px 0",
  },
]);

export const rowKicker = style([
  text.microLabel,
  {
    color: vars.muted,
    minWidth: 76,
  },
]);

export const emptyNote = style([
  text.bodySm,
  {
    color: vars.muted,
  },
]);

export const subGroup = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  paddingLeft: space["3"],
  borderLeft: `2px solid ${vars.rule}`,
});

export const subGroupTitle = style([
  text.row,
  {
    color: vars.ink,
  },
]);
