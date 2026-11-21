import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";

// The fill and left accent bar are painted inline by the component (the
// global calendar CSS forces .fc-event backgrounds transparent, so tiles own
// their fills); this file only lays out the text.
const tileBase = style({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  height: "100%",
  borderRadius: radii.sm,
  fontFamily: vars.font.ui,
  color: vars.ink,
  cursor: "pointer",
});

export const tile = styleVariants({
  busy: [tileBase],
  visual: [tileBase, { opacity: 0.75 }],
});

export const tilePadding = styleVariants({
  tiny: { padding: "0 4px" },
  compact: { padding: "1px 8px" },
  regular: { padding: "6px 10px" },
});

export const tileInner = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
});

const titleBase = style({
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: space["1.5"],
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const titleText = styleVariants({
  compact: [titleBase, { fontSize: 10 }],
  regular: [titleBase, { fontSize: 11.5 }],
});

export const titleVisualOnly = style({
  fontStyle: "italic",
});

export const sourceIcon = style({
  flexShrink: 0,
  opacity: 0.7,
});

export const labelText = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const timeRow = style({
  display: "flex",
  gap: space["1"],
  fontSize: 10,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  opacity: 0.7,
});

export const timeDash = style({
  opacity: 0.6,
});
