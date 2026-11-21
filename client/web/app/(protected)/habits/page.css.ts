import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, contentWidth, radii } from "@/lib/theme/scales";

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

export const headerActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexWrap: "wrap",
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: vars.ink,
});

export const sections = style({
  display: "flex",
  flexDirection: "column",
  gap: space["6"],
  width: "100%",
  maxWidth: contentWidth["2xl"],
});

export const bucketHeader = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: `0 0 ${space["2.5"]}`,
});

export const bucketName = style({
  fontFamily: vars.font.ui,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: vars.inkSoft,
});

export const bucketEditBtn = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: radii.sm,
  color: vars.muted,
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill, color: vars.ink },
  },
});

export const bucketEmpty = style({
  padding: `${space["1"]} 0 ${space["2"]}`,
});

export const list = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: space["4"],
  width: "100%",
});

export const empty = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space["2"],
  padding: space["10"],
  textAlign: "center",
});
