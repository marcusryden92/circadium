import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";
import { CORNER_ACTION_GUTTER } from "../shell/CornerActions/constants";

export const pageHeaderRow = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["3"],
  padding: "20px 28px 18px",
  flexShrink: 0,
  flexWrap: "wrap",
  "@media": {
    // Portrait mobile: the CornerActions pills sit in both top corners, so
    // center the header between them and reserve the pill footprint as gutter.
    [media.mobile]: {
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: space["2.5"],
      padding: `16px ${CORNER_ACTION_GUTTER}px 12px`,
      marginBottom: space["3"],
    },
    // Landscape phone: the pills fold into the bottom menu bar, freeing the
    // top — revert to the normal left-aligned row.
    [media.landscapePhone]: {
      flexDirection: "row",
      alignItems: "baseline",
      textAlign: "left",
      gap: space["2.5"],
      padding: "16px 16px 12px",
    },
  },
});

export const pageHeaderTitle = style([
  display.pageTitle,
  {
    color: vars.ink,
    lineHeight: 1,
    margin: 0,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { fontSize: 24 },
    },
  },
]);

export const pageHeaderSummary = style([
  text.bodySm,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);
