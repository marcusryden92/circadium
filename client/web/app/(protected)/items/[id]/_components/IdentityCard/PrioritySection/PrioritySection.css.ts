import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// Capped columns: pills sit at 28px circles where there's room and compress
// evenly into narrower field columns instead of overflowing the grid cell.
export const priorityRow = style({
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 28px))",
  gap: space["1.5"],
  justifyContent: "start",
});

export const priorityPill = style([
  text.bodySm,
  {
    width: "100%",
    minWidth: 0,
    height: 28,
    border: `1px solid ${vars.glass.stroke}`,
    background: "transparent",
    padding: 0,
    borderRadius: radii.pill,
    cursor: "pointer",
    fontWeight: 700,
    color: vars.inkSoft,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
    selectors: {
      "&:hover": { backgroundColor: vars.glass.bgSoft, borderColor: vars.rule },
      '&[aria-pressed="true"]': {
        background: vars.ink,
        color: vars.paper,
        borderColor: vars.ink,
      },
      '&[aria-pressed="true"]:hover': {
        background: vars.inkSoft,
        borderColor: vars.inkSoft,
      },
    },
  },
]);
