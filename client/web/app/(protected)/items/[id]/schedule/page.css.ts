import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// Scrolls inside the height-locked tab frame on desktop; natural flow on
// mobile where the whole page scrolls instead.
export const root = style({
  paddingTop: space["3"],
  display: "flex",
  flexDirection: "column",
  gap: space["7"],
  flex: "1 1 0%",
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  "@media": {
    [media.mobile]: {
      flex: "1 0 auto",
      minHeight: "auto",
      overflowY: "visible",
      scrollbarGutter: "auto",
    },
  },
});

export const sectionLabel = style([
  text.microLabel,
  {
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: vars.muted,
    marginBottom: space["3.5"],
    transition: themeTransition,
  },
]);

export const dayGroup = style({
  marginBottom: space["6"],
  selectors: {
    "&:last-child": { marginBottom: 0 },
  },
});

export const dayHeader = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["2.5"],
  marginBottom: space["2.5"],
});

export const dayHeaderDate = style([
  display.listTitle,
  {
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const dayHeaderRelative = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const eventRow = style({
  display: "grid",
  gridTemplateColumns: "120px 1fr auto",
  gap: space["4"],
  padding: "10px 0",
  borderTop: `1px solid ${vars.rule}`,
  alignItems: "baseline",
  transition: themeTransition,
  "@media": {
    [media.mobile]: { gridTemplateColumns: "92px 1fr auto", gap: space["2.5"] },
  },
  selectors: {
    "&:last-child": { borderBottom: `1px solid ${vars.rule}` },
  },
});

export const eventTime = style([
  text.row,
  {
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const eventTitle = style([
  text.row,
  {
    color: vars.ink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    transition: themeTransition,
  },
]);

export const eventDuration = style([
  text.bodySm,
  {
    fontVariantNumeric: "tabular-nums",
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const emptyState = style([
  text.body,
  {
    color: vars.inkSoft,
    padding: "12px 0",
    transition: themeTransition,
  },
]);
