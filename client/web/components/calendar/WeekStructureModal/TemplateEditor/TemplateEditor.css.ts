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


export const selectedActions = style({
  display: "flex",
  gap: space["1.5"],
  marginTop: space["2.5"],
  flexWrap: "wrap",
});

export const exceptionsSection = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  marginTop: space["3"],
  paddingTop: space["2.5"],
  borderTop: `1px solid ${vars.rule}`,
});
