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

export const group = style({
  display: "flex",
  flexDirection: "column",
  selectors: {
    "& + &": {
      marginTop: space["3"],
    },
  },
});

export const groupHeader = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "2px 8px 4px",
});

export const groupName = style([
  fieldLabel,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const groupNameDeleted = style([
  groupName,
  {
    textDecoration: "line-through",
    textDecorationThickness: 1.5,
    color: vars.muted,
  },
]);

export const bucketHeading = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "6px 8px 2px",
  selectors: {
    "div + &": {
      marginTop: space["2"],
    },
  },
});

export const bucketHeadingName = style({
  fontFamily: vars.font.ui,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: vars.muted,
  transition: themeTransition,
});

export const bucketHeadingNameDeleted = style([
  bucketHeadingName,
  {
    textDecoration: "line-through",
    textDecorationThickness: 1.5,
  },
]);

export const itemTitle = style([
  text.label,
  {
    fontWeight: 600,
    color: vars.ink,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    transition: themeTransition,
  },
]);

export const itemTitleDeleted = style([
  itemTitle,
  {
    textDecoration: "line-through",
    textDecorationThickness: 1.5,
    color: vars.muted,
  },
]);

export const trackedLabel = style([
  text.microLabel,
  {
    color: vars.muted,
    flexShrink: 0,
  },
]);

export const rowSpacer = style({ flex: 1 });

export const metaCluster = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  flexShrink: 0,
});
