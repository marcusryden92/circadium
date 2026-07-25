import { style } from "@vanilla-extract/css";
import { space } from "@/lib/theme/scales";

export const timePairGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: space["2"],
});

// Vertical padding so a read-only value lines up with the TimePicker beside it.
export const staticSlot = style({
  padding: "6px 0",
});
