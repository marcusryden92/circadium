import { style } from "@vanilla-extract/css";
import { space, media } from "@/lib/theme/scales";

// The popover content column, shared by all four calendar popovers. Landscape
// phones present through the BottomSheet: pair the rows into two columns so the
// editor doesn't run one viewport-wide column deep.
export const popoverBody = style({
  padding: "10px 14px 14px",
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  "@media": {
    [media.landscapePhone]: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      columnGap: space["10"],
      alignItems: "start",
    },
  },
});

// Any block that must span both columns when the body pairs into landscape
// columns (footer, callout, toggle field, notes, status row).
export const fullBleedLandscape = style({
  "@media": {
    [media.landscapePhone]: { gridColumn: "1 / -1" },
  },
});
