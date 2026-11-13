import { style } from "@vanilla-extract/css";
import { space } from "@/lib/theme";

export const group = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
});
