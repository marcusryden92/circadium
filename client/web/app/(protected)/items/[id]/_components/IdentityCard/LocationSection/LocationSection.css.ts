import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";

// Full-width row under the grid: override toggle, picker, and the goal-only
// reset action sit side by side, wrapping on narrow viewports.
export const placeRow = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: space["2.5"],
  rowGap: space["2"],
});

// Reserves a fixed line so the "from {category}" hint can toggle visibility
// without the surrounding column shifting up/down.
export const hintRow = style({
  display: "flex",
  alignItems: "center",
  minHeight: 17,
  marginTop: space["0.5"],
});

// Indented to align the first letter of "from ..." with the first letter of
// the "Inherited" / "Override" labels inside the SegmentedControl above.
// SegmentedControl is: 1px border + 3px outer padding + 14px button padding = 18px.
export const inheritedHint = style([
  text.microLabel,
  {
    paddingLeft: space["5"],
    color: vars.muted,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
]);

// Pulls ghost-size-sm buttons flush-left under the field grid by negating the
// button's internal left padding (pillBtn sm = padding: 6px 14px).
export const flushLeftBtn = style({
  marginLeft: `-${space["3.5"]}`,
});
