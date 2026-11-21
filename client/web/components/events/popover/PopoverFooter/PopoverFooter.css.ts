import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, borderWidth, media } from "@/lib/theme/scales";

export const footer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["2"],
  paddingTop: space["2"],
  borderTop: `${borderWidth.hairline}px solid ${vars.rule}`,
  // Spans both columns when the body pairs into landscape phone columns.
  "@media": {
    [media.landscapePhone]: { gridColumn: "1 / -1" },
  },
});

export const group = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  minWidth: 0,
});
