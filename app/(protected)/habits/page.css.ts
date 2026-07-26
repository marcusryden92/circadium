import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, contentWidth } from "@/lib/theme/scales";

export const page = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  padding: "0 28px 28px",
  "@media": {
    [media.mobile]: {
      padding: space["3.5"],
      flex: "1 0 auto",
      minHeight: "auto",
    },
  },
});

export const header = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: space["3"],
  padding: `${space["4"]} 0 ${space["3"]}`,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: vars.ink,
});

export const list = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: space["4"],
  width: "100%",
  maxWidth: contentWidth["2xl"],
});

export const empty = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space["2"],
  padding: space["10"],
  textAlign: "center",
});
