import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";

export const meter = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  marginTop: space["1.5"],
});

export const bars = style({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: space["1"],
});

export const bar = style({
  height: space["1"],
  borderRadius: space["0.5"],
  background: `color-mix(in srgb, ${vars.muted} 25%, transparent)`,
});

export const filled = styleVariants({
  weak: { background: vars.status.error },
  fair: { background: vars.status.warning },
  good: { background: vars.status.success },
  strong: { background: vars.status.success },
});

export const caption = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  lineHeight: 1.4,
  color: vars.muted,
});
