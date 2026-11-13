import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { display, text, fieldLabel as fieldLabelPreset } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const selectedPanel = style({
  flexShrink: 0,
  padding: "16px 18px",
  borderBottom: `1px solid ${vars.rule}`,
  background: `color-mix(in srgb, ${vars.ink} 3%, transparent)`,
});

export const selectedHeaderRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  marginBottom: space["2.5"],
});

export const selectedSwatch = style({
  width: 10,
  height: 10,
  borderRadius: radii.pill,
  flexShrink: 0,
  boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.ink} 14%, transparent)`,
});

export const selectedTitle = style([
  display.panelTitle,
  {
    color: vars.ink,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
]);

export const fieldGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: space["2"],
  marginBottom: space["2"],
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
});

export const fieldWithMargin = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  marginBottom: space["2"],
});

export const fieldLabel = fieldLabelPreset;

export const fieldStatic = style([
  text.row,
  {
    padding: "6px 0",
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const categoryRow = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  maxHeight: 140,
  overflow: "auto",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii.sm,
  padding: space["1"],
});

export const categoryOption = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: "5px 8px",
  borderRadius: radii.xs,
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.ink,
  display: "flex",
  alignItems: "center",
  gap: space["1.5"],
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  selectors: {
    "&:hover": {
      background: `color-mix(in srgb, ${vars.ink} 6%, transparent)`,
    },
    "&[data-active='true']": {
      background: `color-mix(in srgb, ${vars.accent.primary} 14%, transparent)`,
      color: vars.ink,
      fontWeight: 600,
    },
  },
});

export const categoryDot = style({
  width: 8,
  height: 8,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const selectedActions = style({
  display: "flex",
  gap: space["1.5"],
  marginTop: space["2.5"],
  flexWrap: "wrap",
});

export const unassignedHint = style({
  fontSize: 10.5,
  color: vars.muted,
  marginTop: space["1.5"],
  fontFamily: vars.font.ui,
});

export const exceptionsSection = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  marginTop: space["3"],
  paddingTop: space["2.5"],
  borderTop: `1px solid ${vars.rule}`,
});
