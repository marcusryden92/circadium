import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// Same two-column shape as SplittingSection: toggle on the left, the duration
// input on the right, so enabling the limit does not change section height.
export const limitGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 2fr",
  gap: "13px 0",
  alignItems: "start",
  minWidth: 0,
  "@media": {
    [media.mobile]: { gridTemplateColumns: "1fr" },
  },
});

export const toggleRow = style({
  display: "flex",
  alignItems: "center",
  paddingLeft: space["2"],
  gap: space["3"],
  minHeight: 34,
});

export const toggleHint = style([
  text.bodySm,
  {
    color: vars.muted,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    lineHeight: "15px",
    minWidth: 200,
    transition: themeTransition,
  },
]);

export const fieldRow = style({
  display: "flex",
  alignItems: "center",
  minHeight: 34,
});
