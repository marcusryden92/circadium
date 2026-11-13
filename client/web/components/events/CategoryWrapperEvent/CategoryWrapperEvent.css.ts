import { style } from "@vanilla-extract/css";

// The per-category fill tint and trespass borders stay inline on the
// component — they are computed from the category color / engine flags.
export const wrapper = style({
  position: "relative",
  width: "100%",
  height: "100%",
  border: "none",
  borderRadius: 0,
});

export const stripeSvg = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
});
