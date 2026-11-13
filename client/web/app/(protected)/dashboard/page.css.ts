import { style } from "@vanilla-extract/css";
import { space, media } from "@/lib/theme/scales";

export const page = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: {
      flex: "1 0 auto",
      minHeight: "auto",
    },
  },
});

export const gridWrap = style({
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: space["5"],
  padding: "0 28px 28px",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.laptop]: {
      gridTemplateColumns: "1fr",
      flex: "0 0 auto",
      minHeight: "auto",
    },
    [media.mobile]: {
      display: "flex",
      flexDirection: "column",
      flex: "1 0 auto",
      padding: 0,
      gap: space["3.5"],
    },
  },
});

export const rightCol = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  minHeight: 0,
  "@media": {
    [media.mobile]: { display: "none" },
  },
});
