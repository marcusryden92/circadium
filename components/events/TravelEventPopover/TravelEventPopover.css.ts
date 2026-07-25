import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";

// Accent color keyed by the popover's travel-health variant. "ok" reads muted
// so the estimate delta stays quiet when nothing is wrong.
export const tone = styleVariants({
  error: { color: vars.status.error },
  warning: { color: vars.status.warning },
  ok: { color: vars.muted },
});

export const statusNote = style([
  text.microLabel,
  {
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
]);

export const routeArrow = style({
  color: vars.muted,
});

export const estimateValueRow = style({
  display: "flex",
  alignItems: "baseline",
  gap: space["1.5"],
  fontVariantNumeric: "tabular-nums",
});

export const estimateDelta = style([text.bodySm, { fontWeight: 600 }]);
