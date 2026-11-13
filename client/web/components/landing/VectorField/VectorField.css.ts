import { style } from "@vanilla-extract/css";

export const host = style({
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  zIndex: 0,
});

// Starts transparent; useCanvas flips opacity after the first drawn frame so
// the field blends in over the flat background instead of popping.
export const canvas = style({
  display: "block",
  width: "100%",
  height: "100%",
  opacity: 0,
  transition: "opacity 1.4s ease",
});
