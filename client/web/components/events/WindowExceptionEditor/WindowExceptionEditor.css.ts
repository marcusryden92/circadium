import { style, styleVariants } from "@vanilla-extract/css";
import { space } from "@/lib/theme/scales";

const containerBase = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const container = styleVariants({
  card: [containerBase, { gap: space["2"] }],
  rail: [containerBase],
});

export const formStack = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const addRow = style({
  display: "flex",
  justifyContent: "flex-start",
});

export const listStack = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
});
