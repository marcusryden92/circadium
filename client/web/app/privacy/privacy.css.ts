import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, contentWidth, media, radii } from "@/lib/theme/scales";

export const page = style({
  minHeight: "100vh",
  width: "100%",
  boxSizing: "border-box",
  background: vars.paper,
  color: vars.ink,
  overflowY: "auto",
  overflowX: "hidden",
});

export const nav = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px clamp(24px, 6vw, 96px)",
  borderBottom: `1px solid ${vars.rule}`,
});

export const navLink = style({
  color: vars.muted,
  textDecoration: "none",
  fontFamily: vars.font.ui,
  fontSize: 13,
  selectors: {
    "&:hover": { color: vars.ink },
  },
});

export const wordmark = style({
  display: "inline-flex",
  textDecoration: "none",
});

export const container = style({
  maxWidth: contentWidth.md,
  margin: "0 auto",
  padding: "clamp(48px, 8vw, 96px) clamp(24px, 6vw, 48px) 96px",
  fontFamily: vars.font.ui,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(32px, 5vw, 48px)",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
  margin: 0,
  color: vars.ink,
});

export const updated = style({
  marginTop: space["3"],
  marginBottom: space["8"],
  color: vars.muted,
  fontSize: 13,
});

export const lead = style({
  fontSize: 18,
  lineHeight: 1.65,
  color: vars.inkSoft,
  margin: `0 0 ${space["8"]}`,
});

export const section = style({
  margin: `0 0 ${space["8"]}`,
});

export const heading = style({
  fontFamily: vars.font.display,
  fontSize: 22,
  letterSpacing: "-0.01em",
  margin: `0 0 ${space["4"]}`,
  color: vars.ink,
});

export const body = style({
  fontSize: 15,
  lineHeight: 1.7,
  color: vars.inkSoft,
  margin: `0 0 ${space["4"]}`,
});

export const list = style({
  fontSize: 15,
  lineHeight: 1.7,
  color: vars.inkSoft,
  margin: `0 0 ${space["4"]}`,
  paddingLeft: space["5"],
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const callout = style({
  border: `1px solid ${vars.rule}`,
  borderRadius: radii.lg,
  background: vars.glass.bgSoft,
  padding: "clamp(20px, 3vw, 28px)",
  margin: `${space["6"]} 0`,
});

export const calloutHeading = style({
  fontFamily: vars.font.display,
  fontSize: 16,
  margin: `0 0 ${space["3"]}`,
  color: vars.ink,
});

export const link = style({
  color: vars.accent.primary,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  selectors: {
    "&:hover": { textDecoration: "none" },
  },
});

export const footer = style({
  padding: "32px clamp(24px, 6vw, 96px) 40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["4"],
  borderTop: `1px solid ${vars.rule}`,
  color: vars.muted,
  fontSize: 12,
  fontFamily: vars.font.ui,
  "@media": {
    [media.mobile]: {
      flexDirection: "column",
      alignItems: "flex-start",
      padding: "24px 24px 32px",
    },
  },
});
