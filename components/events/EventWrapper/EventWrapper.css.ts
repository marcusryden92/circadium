import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space } from "@/lib/theme/scales";
import { backdropFilters } from "@/lib/theme/effects";

// Surface fill, template border, and trespass borders stay inline in the
// component — they derive from the per-event tint and engine trespass flags.
const tileBase = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  height: "100%",
  overflow: "hidden",
  borderRadius: radii.sm,
  backdropFilter: backdropFilters.event,
  WebkitBackdropFilter: backdropFilters.event,
  color: vars.textOnAccent,
  fontFamily: vars.font.ui,
});

// Padding steps down with the event tier so short tiles keep text inside.
export const tile = styleVariants({
  tiny: [tileBase, { padding: `0 ${space["1"]}px` }],
  compact: [tileBase, { padding: `${space.px}px ${space["2"]}px` }],
  regular: [tileBase, { padding: `${space["1.5"]}px ${space["2.5"]}px` }],
});

export const textBlock = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
});

export const titleRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["1.5"],
});

export const pin = style({
  color: `color-mix(in srgb, ${vars.textOnAccent} 85%, transparent)`,
  flexShrink: 0,
  transform: "rotate(20deg)",
});

const titleBase = style({
  fontWeight: 500,
  fontStyle: "italic",
  color: vars.textOnAccent,
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const title = styleVariants({
  compact: [titleBase, { fontSize: 10 }],
  regular: [titleBase, { fontSize: 11.5 }],
});

export const timeRow = style({
  display: "flex",
  gap: space["1"],
  fontSize: 10,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  color: `color-mix(in srgb, ${vars.textOnAccent} 70%, transparent)`,
});

export const timeDash = style({
  opacity: 0.6,
});
