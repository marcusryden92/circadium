import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const section = style({
  display: "flex",
  flexDirection: "column",
  padding: `${space["2"]}px 0`,
  selectors: {
    "& + &": {
      borderTop: `1px solid ${vars.rule}`,
    },
  },
});

export const sectionHead = style([
  fieldLabel,
  {
    padding: `${space["1"]}px 16px ${space["1.5"]}px`,
  },
]);

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  minHeight: 44,
  width: "100%",
  padding: "6px 16px",
  border: "none",
  background: "transparent",
  color: vars.ink,
  fontFamily: vars.font.ui,
  fontSize: 14,
  textAlign: "left",
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:active": {
      background: vars.interactive.hoverFill,
    },
  },
});

export const rowActive = style({
  background: vars.interactive.selectedFill,
  fontWeight: 600,
  selectors: {
    "&:active": {
      background: vars.interactive.selectedFill,
    },
  },
});

export const rowIcon = style({
  display: "inline-flex",
  width: 18,
  justifyContent: "center",
  color: vars.muted,
  flexShrink: 0,
});

export const rowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const rowCount = style({
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  color: vars.muted,
  fontWeight: 500,
  flexShrink: 0,
});

export const rowCountAlert = style({
  color: vars.status.error,
  fontWeight: 700,
});

export const chevronBtn = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  margin: "-4px 0",
  borderRadius: radii.sm,
  color: vars.muted,
  flexShrink: 0,
});

export const chevronSpacer = style({
  display: "inline-block",
  width: 32,
  flexShrink: 0,
});

export const colorDot = style({
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const noColorDot = style({
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: radii.pill,
  border: `1px dashed ${vars.muted}`,
  opacity: 0.5,
  flexShrink: 0,
});

export const emptyNote = style({
  padding: "8px 16px 12px",
  fontSize: 13,
  color: vars.muted,
  fontFamily: vars.font.ui,
});
