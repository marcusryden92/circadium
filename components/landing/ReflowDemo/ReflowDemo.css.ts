import { globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space } from "@/lib/theme/scales";

// Lives on the dark editorial section only, hence the literal paper-tinted
// rgba values instead of theme vars. Motion is GSAP-driven (ReflowDemo.tsx);
// the base state here is the pre-reflow day.
export const card = style({
  width: "100%",
  maxWidth: 460,
  marginTop: "clamp(40px, 4vw, 56px)",
  padding: "16px 18px 20px",
  borderRadius: radii["xl+2"],
  border: "1px solid rgba(242,239,234,0.14)",
  background: "rgba(242,239,234,0.05)",
});

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  marginBottom: space["3.5"],
});

export const day = style({
  fontFamily: vars.font.display,
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: "-0.01em",
  color: "rgba(242,239,234,0.85)",
});

export const chip = style({
  fontFamily: vars.font.ui,
  fontSize: 11,
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: radii.pill,
  background: `color-mix(in srgb, ${vars.swatches.rose} 26%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.swatches.rose} 55%, transparent)`,
  color: "rgba(242,239,234,0.9)",
  opacity: 0,
  visibility: "hidden",
});

// 40px per hour, 9:00 at the top.
export const canvas = style({
  position: "relative",
  height: 244,
  backgroundImage:
    "repeating-linear-gradient(to bottom, rgba(242,239,234,0.09) 0 1px, transparent 1px 40px)",
});

export const hour = style({
  position: "absolute",
  left: 0,
  transform: "translateY(-50%)",
  fontFamily: vars.font.ui,
  fontSize: 10,
  color: "rgba(242,239,234,0.45)",
});

const blockBase = style({
  position: "absolute",
  left: 48,
  right: 8,
  padding: "5px 9px",
  borderRadius: radii.xs,
  fontFamily: vars.font.ui,
  fontSize: 11.5,
  fontWeight: 600,
  color: "rgba(242,239,234,0.92)",
  boxSizing: "border-box",
  overflow: "hidden",
});

const blockTone = styleVariants(
  {
    blue: vars.swatches.blue,
    violet: vars.swatches.violet,
    green: vars.swatches.green,
    rose: vars.swatches.rose,
  },
  (c) => ({
    background: `color-mix(in srgb, ${c} 30%, transparent)`,
    borderLeft: `3px solid ${c}`,
  }),
);

export const blockDeep = style([
  blockBase,
  blockTone.blue,
  { top: 0, height: 76 },
]);

export const blockMeeting = style([
  blockBase,
  blockTone.rose,
  { top: 80, height: 36, opacity: 0, visibility: "hidden" },
]);

export const blockWriting = style([
  blockBase,
  blockTone.violet,
  { top: 80, height: 56 },
]);

export const blockGym = style([
  blockBase,
  blockTone.green,
  { top: 200, height: 36 },
]);

globalStyle(`${card} *`, {
  pointerEvents: "none",
});
