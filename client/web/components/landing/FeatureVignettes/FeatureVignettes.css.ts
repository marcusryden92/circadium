import { globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space } from "@/lib/theme/scales";

export const stage = style({
  width: "100%",
  maxWidth: 400,
  padding: space["6"],
  borderRadius: radii["2xl"],
  border: `1px solid ${vars.rule}`,
  background: `color-mix(in srgb, ${vars.ink} 4%, ${vars.paper})`,
});

const toneColors = {
  blue: vars.swatches.blue,
  violet: vars.swatches.violet,
  green: vars.swatches.green,
  amber: vars.swatches.amber,
  teal: vars.swatches.teal,
  rose: vars.swatches.rose,
} as const;

export type Tone = keyof typeof toneColors;

export const block = style({
  borderRadius: radii.xs,
});

export const blockTones = styleVariants(toneColors, (c) => ({
  background: `color-mix(in srgb, ${c} 22%, ${vars.paper})`,
  borderLeft: `3px solid ${c}`,
}));

// ---------- week grid ----------
export const weekDays = style({
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: space["2.5"],
  marginBottom: space["2.5"],
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: vars.muted,
  textAlign: "center",
});

export const weekCols = style({
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: space["2.5"],
  alignItems: "start",
});

export const weekCol = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

// ---------- travel ----------
export const travelStage = style({
  position: "relative",
  height: 230,
});

export const travelSvg = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  color: vars.muted,
});

globalStyle(`${travelSvg} path`, {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeDasharray: "2 7",
  strokeLinecap: "round",
  fill: "none",
  opacity: 0.8,
});

export const travelChip = style({
  position: "absolute",
  transform: "translate(-50%, -50%)",
  display: "inline-flex",
  alignItems: "center",
  gap: space["2"],
  padding: "6px 13px",
  borderRadius: radii.pill,
  background: vars.paper,
  border: `1px solid ${vars.rule}`,
  boxShadow: vars.shadow.panelSm,
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  color: vars.ink,
  whiteSpace: "nowrap",
});

export const travelDot = style({
  width: 7,
  height: 7,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const travelTime = style({
  position: "absolute",
  transform: "translate(-50%, -50%)",
  padding: "3px 9px",
  borderRadius: radii.pill,
  background: `color-mix(in srgb, ${vars.ink} 6%, ${vars.paper})`,
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.muted,
  whiteSpace: "nowrap",
});

// ---------- category windows ----------
export const windowsGrid = style({
  display: "grid",
  gridTemplateColumns: "26px repeat(3, 1fr)",
  gap: space["2.5"],
  height: 230,
});

export const windowsRuler = style({
  position: "relative",
  fontFamily: vars.font.ui,
  fontSize: 10,
  color: vars.muted,
});

export const windowsHour = style({
  position: "absolute",
  right: 4,
  transform: "translateY(-50%)",
});

export const windowsCol = style({
  position: "relative",
  borderRadius: radii.sm,
  background: `color-mix(in srgb, ${vars.ink} 3%, transparent)`,
});

export const windowBand = style({
  position: "absolute",
  left: 4,
  right: 4,
  borderRadius: radii.sm,
});

export const bandTones = styleVariants(toneColors, (c) => ({
  background: `color-mix(in srgb, ${c} 10%, transparent)`,
  border: `1px dashed color-mix(in srgb, ${c} 45%, transparent)`,
}));

export const windowEvent = style({
  height: 26,
  margin: space["1.5"],
  borderRadius: radii.xs,
});

// Stronger fill than blockTones — inside an already-tinted band a 22% mix
// disappears.
export const windowEventTones = styleVariants(toneColors, (c) => ({
  background: `color-mix(in srgb, ${c} 45%, ${vars.paper})`,
  borderLeft: `3px solid ${c}`,
}));

// ---------- goal tree ----------
export const goalRoot = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
});

export const goalRootTitle = style({
  fontFamily: vars.font.display,
  fontSize: 17,
  fontWeight: 500,
  letterSpacing: "-0.01em",
  color: vars.ink,
});

export const goalChip = style({
  fontFamily: vars.font.ui,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: radii.pill,
  background: vars.ink,
  color: vars.paper,
});

export const goalChildren = style({
  marginTop: space["3"],
  marginLeft: space["1"],
  paddingLeft: space["4"],
  borderLeft: `1px solid ${vars.rule}`,
  display: "flex",
  flexDirection: "column",
  gap: space["2.5"],
});

export const goalRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const goalDot = style({
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  border: `1.5px solid ${vars.muted}`,
  flexShrink: 0,
});

export const goalDotDone = style({
  background: vars.swatches.green,
  borderColor: vars.swatches.green,
});

export const goalText = style({
  fontFamily: vars.font.ui,
  fontSize: 13,
  fontWeight: 500,
  color: vars.inkSoft,
});

export const goalTextDone = style({
  color: vars.muted,
  textDecoration: "line-through",
});

export const goalDate = style({
  fontFamily: vars.font.ui,
  fontSize: 10,
  fontWeight: 600,
  color: vars.muted,
  padding: "2px 8px",
  borderRadius: radii.pill,
  border: `1px solid ${vars.rule}`,
});
