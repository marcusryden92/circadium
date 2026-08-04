import { style } from "@vanilla-extract/css";
import { space } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";

// Overlaid on the tile bottom instead of taking flex-flow space: short tiles
// don't have room for a 22px button row under the text, so in-flow buttons
// got shoved past the tile edge and clipped.
export const hoverActions = style({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "2px 3px",
  background:
    "linear-gradient(to top, color-mix(in srgb, black 30%, transparent) 60%, transparent)",
  borderBottomLeftRadius: "inherit",
  borderBottomRightRadius: "inherit",
});

export const actionGroup = style({
  display: "flex",
  gap: space["2"],
});

// Tile text color tracks the event color, so the recipe's ink colors are
// overridden back to inherit.
export const iconButton = style([
  iconBtn({ size: "sm" }),
  {
    selectors: {
      "&&": { color: "inherit" },
      "&&:hover:not(:disabled)": { color: "inherit" },
    },
  },
]);
