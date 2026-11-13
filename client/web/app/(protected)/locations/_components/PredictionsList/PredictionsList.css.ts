import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";

// Absolute-positioned overlay anchored to its position: relative wrap.
// The parent modal must use `overflow: visible` for this to escape its box.
// Opaque paper background overrides popover's translucent glass fill so the
// list reads as a solid surface when it overlaps the modal's footer buttons.
export const predictions = style([
  popover({ size: "sm" }),
  {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    zIndex: 50,
    background: vars.paper,
    display: "flex",
    flexDirection: "column",
    maxHeight: 240,
    overflow: "auto",
  },
]);

export const predictionRow = style({
  textAlign: "left",
  padding: "9px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  fontFamily: vars.font.ui,
  color: vars.ink,
  borderBottom: `1px solid ${vars.glass.stroke}`,
  selectors: {
    "&:last-child": { borderBottom: "none" },
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const predictionRowActive = style({
  background: vars.glass.bgDeep,
  boxShadow: `inset 3px 0 0 ${vars.ink}`,
});

export const predictionMain = style({
  fontSize: 13,
  fontWeight: 600,
});

export const predictionSub = style({
  fontSize: 11,
  color: vars.muted,
});
