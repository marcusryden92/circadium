import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, zIndex, space } from "@/lib/theme/scales";

export const container = style({
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
  cursor: "grab",
  selectors: {
    "&[data-panning='true']": { cursor: "grabbing" },
  },
});

// Touch-only affordance: a tapped node shows this over its right edge; tapping
// it navigates. Positioned imperatively each frame so it tracks pan/zoom.
export const openChip = style({
  position: "absolute",
  top: 0,
  left: 0,
  zIndex: zIndex.raised,
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  minHeight: 34,
  padding: "0 14px",
  background: vars.ink,
  color: vars.paper,
  border: "none",
  borderRadius: radii.pill,
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  boxShadow: vars.shadow.panelSm,
  cursor: "pointer",
  touchAction: "none",
});

export const canvas = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
  touchAction: "none",
});
