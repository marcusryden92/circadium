import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, borderWidth } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";

const calloutBase = style({
  display: "flex",
  alignItems: "flex-start",
  gap: space["2.5"],
  padding: "10px 12px",
  borderRadius: radii["sm+2"],
});

export const callout = styleVariants({
  error: [
    calloutBase,
    {
      border: `${borderWidth.hairline}px solid ${vars.status.error}`,
      background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.subtleFill}%, transparent)`,
    },
  ],
  warning: [
    calloutBase,
    {
      border: `${borderWidth.hairline}px solid ${vars.status.warning}`,
      background: `color-mix(in srgb, ${vars.status.warning} ${colorMixAlpha.subtleFill}%, transparent)`,
    },
  ],
});

export const calloutIcon = styleVariants({
  error: { marginTop: space["px"], flexShrink: 0, color: vars.status.error },
  warning: {
    marginTop: space["px"],
    flexShrink: 0,
    color: vars.status.warning,
  },
});

export const calloutText = style([
  text.label,
  {
    color: vars.ink,
    lineHeight: 1.45,
  },
]);
