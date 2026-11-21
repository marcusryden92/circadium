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

export const dayGroup = style({
  display: "flex",
  flexDirection: "column",
  selectors: {
    "& + &": {
      marginTop: space["2.5"],
    },
  },
});

export const dayLabel = style([
  fieldLabel,
  {
    color: vars.inkSoft,
    padding: "2px 8px 4px",
    transition: themeTransition,
  },
]);

export const colorDot = style({
  width: 8,
  height: 8,
  borderRadius: radii.pill,
  flexShrink: 0,
  transition: themeTransition,
  selectors: {
    "&[data-empty='true']": {
      background: "transparent",
      border: `1px solid ${vars.rule}`,
    },
  },
});

export const timeRange = style([
  text.label,
  {
    fontWeight: 600,
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: themeTransition,
  },
]);

export const overnightMarker = style({
  marginLeft: space["1"],
  fontSize: 9,
  fontWeight: 700,
  color: vars.muted,
  verticalAlign: "super",
});

export const templateTitle = style([
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

export const templateTitleDeleted = style([
  templateTitle,
  {
    textDecoration: "line-through",
    textDecorationThickness: 1.5,
    color: vars.muted,
  },
]);

export const metaCluster = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  flexShrink: 0,
});

export const metaText = style([
  text.microLabel,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
]);

export const metaSep = style({
  color: vars.rule,
  fontSize: 11,
});
