import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";

export const wrap = style({
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: space["6"],
});

export const panel = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space["4"],
  textAlign: "center",
  maxWidth: 420,
  padding: space["6"],
  borderRadius: radii.lg,
});

export const title = style([display.panelTitle, { color: vars.ink }]);

export const body = style([
  text.body,
  { color: vars.inkSoft, lineHeight: 1.5, margin: 0 },
]);
