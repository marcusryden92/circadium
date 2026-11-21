import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space } from "@/lib/theme/scales";
import { caption, display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const wrap = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: space["6"],
  overflow: "auto",
});

export const panel = style({
  width: "100%",
  maxWidth: 460,
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
  padding: space["6"],
  borderRadius: radii["xl"],
  background: vars.glass.bg,
  border: `1px solid ${vars.glass.stroke}`,
  boxShadow: vars.shadow.panelSm,
  transition: themeTransition,
});

export const iconBadge = style({
  width: 40,
  height: 40,
  borderRadius: radii.pill,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: vars.interactive.selectedFill,
  color: vars.accent.primary,
});

export const title = style([display.panelTitle, { color: vars.ink }]);

export const bodyText = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    lineHeight: 1.55,
  },
]);

export const keyForm = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const keyRow = style({
  display: "flex",
  gap: space["2"],
  alignItems: "center",
});

export const keyInput = style({
  flex: 1,
  minWidth: 0,
});

export const errorText = style([
  caption,
  {
    color: vars.status.error,
  },
]);

export const deviceNote = style([
  caption,
  {
    color: vars.muted,
    lineHeight: 1.5,
  },
]);

export const consoleLink = style({
  color: vars.accent.primary,
  textDecorationLine: "underline",
  textUnderlineOffset: 2,
});

export const optOutRow = style({
  display: "flex",
  justifyContent: "center",
  marginTop: space["1"],
});
