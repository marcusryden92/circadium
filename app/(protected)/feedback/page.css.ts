import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const page = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: {
      flex: "0 0 auto",
      minHeight: "auto",
    },
  },
});

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "360px 1fr",
  alignItems: "start",
  gap: space["4"],
  padding: "0 28px 28px",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.tablet]: {
      gridTemplateColumns: "1fr",
      flex: "0 0 auto",
      minHeight: "auto",
    },
    [media.mobile]: {
      padding: "0 0 24px",
      gap: space["3.5"],
    },
  },
});

export const adminLink = style([
  text.bodySm,
  {
    marginLeft: "auto",
    padding: "6px 14px",
    borderRadius: radii.pill,
    border: `1px solid ${vars.rule}`,
    color: vars.inkSoft,
    textDecoration: "none",
    transition: themeTransition,
    selectors: {
      "&:hover": {
        color: vars.ink,
        borderColor: vars.glass.stroke,
        background: vars.interactive.hoverFill,
      },
    },
  },
]);
