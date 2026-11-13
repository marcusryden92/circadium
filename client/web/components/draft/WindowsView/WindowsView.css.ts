import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
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

export const categoryGroup = style({
  display: "flex",
  flexDirection: "column",
  selectors: {
    "& + &": {
      marginTop: space["3"],
    },
  },
});

export const categoryHeader = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "2px 8px 4px",
});

export const categoryName = style([
  fieldLabel,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const categoryNameDeleted = style([
  categoryName,
  {
    textDecoration: "line-through",
    textDecorationThickness: 1.5,
    color: vars.muted,
  },
]);

export const categoryParentNote = style({
  fontFamily: vars.font.ui,
  fontSize: 10,
  color: vars.muted,
  whiteSpace: "nowrap",
  transition: themeTransition,
});

export const flagChip = style({
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 600,
  padding: "1px 6px",
  borderRadius: radii.pill,
  border: `1px solid ${vars.rule}`,
  color: vars.muted,
  whiteSpace: "nowrap",
  transition: themeTransition,
  selectors: {
    "&[data-changed='true']": {
      borderColor: vars.accent.primary,
      color: vars.accent.primary,
    },
  },
});

export const dayLabel = style([
  text.label,
  {
    fontWeight: 600,
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    flexShrink: 0,
    width: 78,
    transition: themeTransition,
  },
]);

export const timeRange = style([
  text.label,
  {
    fontWeight: 600,
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: themeTransition,
  },
]);

export const timeRangeDeleted = style([
  timeRange,
  {
    textDecoration: "line-through",
    textDecorationThickness: 1.5,
    color: vars.muted,
  },
]);

export const rowSpacer = style({ flex: 1 });

export const metaCluster = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  flexShrink: 0,
});
