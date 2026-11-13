import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { zIndex, space } from "@/lib/theme/scales";

export const overlay = style({
  // Absolute (not fixed) so it fills the shell canvas and is clipped to the
  // canvas rounding + overflow, covering the sidebar and main content only.
  position: "absolute",
  inset: 0,
  zIndex: zIndex.appLoading,
  background: vars.paper,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: space["12"],
  paddingBottom: space["12"],
  opacity: 1,
  transition: "opacity 1s ease",
});

export const overlayHidden = style({
  opacity: 0,
  pointerEvents: "none",
});

export const logo = style({
  height: "15vh",
  width: "15vh",
  color: vars.ink,
  flexShrink: 0,
});
