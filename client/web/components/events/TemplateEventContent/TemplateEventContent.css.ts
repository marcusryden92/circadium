import { style } from "@vanilla-extract/css";
import { iconBtn } from "@/lib/theme/recipes.css";

export const hoverRow = style({
  display: "flex",
  width: "100%",
  justifyContent: "space-between",
});

export const hoverBtnGroup = style({
  display: "flex",
  justifyContent: "flex-end",
});

// Tile text color tracks the event color, so the recipe's ink colors are
// overridden back to inherit.
export const hoverBtn = style([
  iconBtn({ size: "sm" }),
  {
    selectors: {
      "&&": { color: "inherit" },
      "&&:hover:not(:disabled)": { color: "inherit" },
    },
  },
]);
