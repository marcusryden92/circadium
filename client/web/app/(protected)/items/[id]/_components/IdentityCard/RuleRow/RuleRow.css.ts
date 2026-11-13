import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  minHeight: 38,
  selectors: {
    "& + &": { borderTop: `1px solid ${vars.rule}` },
  },
});

export const rowMain = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  background: "transparent",
  border: "none",
  borderRadius: radii.sm,
  padding: "7px 6px",
  cursor: "pointer",
  textAlign: "left",
  transition: interactiveTransition("background-color"),
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const rowLabel = style([
  fieldLabel,
  {
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: themeTransition,
  },
]);

export const rowSummary = style([
  text.bodySm,
  {
    marginLeft: "auto",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const rowSummaryOn = style({
  color: vars.inkSoft,
  fontWeight: 500,
});

export const rowIcon = style({
  color: vars.muted,
  flexShrink: 0,
});

export const panel = style({
  width: 340,
  maxWidth: "calc(100vw - 24px)",
  zIndex: zIndex.modal,
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  padding: space["4"],
});

export const panelTitle = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);
