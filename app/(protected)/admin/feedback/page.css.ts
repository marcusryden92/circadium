import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

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
    },
  },
});

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "300px 1fr",
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
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  transition: themeTransition,
  "@media": {
    [media.mobile]: {
      borderRadius: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
  },
});

export const rail = style([cardBase, { padding: "12px 8px 8px" }]);

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
  gap: space["0.5"],
});

export const reportRow = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  padding: "8px 10px",
  borderRadius: radii.sm,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
    "&[data-selected='true']": { background: vars.interactive.selectedFill },
  },
});

export const reportRowTitle = style([
  text.row,
  {
    color: vars.ink,
    display: "flex",
    alignItems: "center",
    gap: space["1.5"],
  },
]);

export const snapshotDot = style({
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: vars.accent.primary,
  flexShrink: 0,
});

export const reportRowExcerpt = style([
  text.bodySm,
  {
    color: vars.muted,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
]);

export const reportRowMeta = style([
  text.microLabel,
  {
    color: vars.muted,
  },
]);

export const mainCard = style([cardBase, {}]);

export const mainScroll = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
});

export const reportHeader = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
  padding: "16px 18px 12px",
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const reportHeaderRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexWrap: "wrap",
});

export const reportSender = style([
  text.row,
  {
    color: vars.ink,
  },
]);

export const reportDate = style([
  text.bodySm,
  {
    color: vars.muted,
  },
]);

export const headerActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  marginLeft: "auto",
  flexWrap: "wrap",
});

export const reportMessage = style([
  text.body,
  {
    margin: 0,
    color: vars.inkSoft,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
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

export const noSnapshotNote = style([
  text.bodySm,
  {
    padding: space["4.5"],
    color: vars.muted,
  },
]);

export const loadingWrap = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "36px 0",
});
