import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space } from "@/lib/theme/scales";

export const wrapper = style({
  position: "relative",
  display: "block",
  minWidth: 0,
});

// Nested under the wrapper so it outranks the input recipe's own padding,
// whatever order the stylesheets load in.
export const withToggle = style({
  selectors: {
    [`${wrapper} &`]: {
      paddingRight: space["10"],
      width: "100%",
    },
  },
});

export const toggle = style({
  position: "absolute",
  top: "50%",
  right: space["1.5"],
  transform: "translateY(-50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: space["7"],
  height: space["7"],
  padding: 0,
  border: "none",
  borderRadius: radii.xs,
  background: "transparent",
  color: vars.muted,
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.ink },
    "&:focus-visible": { outline: `2px solid ${vars.ink}`, outlineOffset: 1 },
    "&:disabled": { cursor: "default", opacity: 0.5 },
  },
});
