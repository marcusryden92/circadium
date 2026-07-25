import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";

export const row = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  padding: `${space["2"]}px ${space["2.5"]}px`,
  borderRadius: radii.sm,
  background: `color-mix(in srgb, ${vars.ink} ${colorMixAlpha.subtleFill}%, transparent)`,
});

export const label = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  minWidth: 0,
});

export const title = style([
  text.bodySm,
  {
    fontWeight: 600,
    color: vars.ink,
  },
]);

export const hint = style([
  text.microLabel,
  {
    color: vars.muted,
  },
]);
