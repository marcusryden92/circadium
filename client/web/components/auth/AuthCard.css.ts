import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

// Flat form stack. The formPanel already paints paper; the auth content
// sits directly on it with no chrome, mirroring the landing's editorial
// aesthetic where content lives on paper without elevated containers.
export const card = style({
  width: "min(420px, calc(100vw - 32px))",
  display: "flex",
  flexDirection: "column",
  gap: space["5"],
  color: vars.ink,
  fontFamily: vars.font.ui,
  position: "relative",
});

export const brandRow = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
  marginBottom: space["2"],
});

// Headline — display weight, large, ink. Reads as the page title for the
// auth flow, mirroring the landing's intro headline rhythm.
export const title = style({
  fontFamily: vars.font.display,
  fontSize: 32,
  fontWeight: 400,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
  color: vars.ink,
  margin: 0,
});

export const subtitle = style({
  fontFamily: vars.font.ui,
  fontSize: 13,
  color: vars.inkSoft,
  lineHeight: 1.5,
  marginTop: space["0.5"],
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

export const divider = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  margin: "4px 0",
});

export const dividerLine = style({
  flex: 1,
  height: 1,
  background: vars.rule,
  transition: themeTransition,
});

export const dividerLabel = style({
  fontFamily: vars.font.ui,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: vars.muted,
});

export const altRow = style({
  textAlign: "center",
  fontSize: 12,
  color: vars.muted,
  marginTop: space["0.5"],
});

export const altLink = style({
  marginLeft: space["1.5"],
  color: vars.ink,
  fontWeight: 600,
  textDecoration: "none",
  transition: themeTransition,
  selectors: {
    "&:hover": { color: vars.accent.primary },
  },
});
