import { style } from "@vanilla-extract/css";
import { media } from "@/lib/theme/scales";

// Mirror SplittingSection: the recurrence select on the left, the optional
// "until" date on the right, so setting an end date does not grow the section.
export const recurGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "13px 22px",
  alignItems: "start",
  minWidth: 0,
  "@media": {
    [media.mobile]: { gridTemplateColumns: "1fr" },
  },
});
