import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// Two field-grid columns: toggle on the left, chunk boxes on the right. The
// boxes sit beside the toggle rather than under it, so enabling splitting does
// not change the section's height. Column gap matches IdentityCard's fieldGrid.
export const splitGrid = style({
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

// Clamp to two 15px lines so a wrapped hint can never grow the toggle row past
// its 34px min-height (which must match the Recurrence <select> so the two
// collapsed sections are the same height).
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
