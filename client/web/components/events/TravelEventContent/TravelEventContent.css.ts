import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, borderWidth } from "@/lib/theme/scales";
import { colorMixAlpha } from "@/lib/theme/effects";

const tileBase = style({
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  height: "100%",
  borderRadius: radii.sm,
  fontFamily: vars.font.ui,
  cursor: "pointer",
});

// Fill/border/text keyed by travel health: insufficient travel (error),
// overconstrained window (warning), or a plain travel tile.
export const tile = styleVariants({
  error: [
    tileBase,
    {
      background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.alertFill}%, transparent)`,
      border: `${borderWidth.hairline}px solid ${vars.status.error}`,
      color: vars.textOnAccent,
    },
  ],
  warning: [
    tileBase,
    {
      background: `color-mix(in srgb, ${vars.status.warning} ${colorMixAlpha.alertFill}%, transparent)`,
      border: `${borderWidth.hairline}px solid ${vars.status.warning}`,
      color: vars.textOnAccent,
    },
  ],
  plain: [
    tileBase,
    {
      background: vars.tileFill,
      border: `${borderWidth.hairline}px solid ${vars.ink}`,
      color: vars.ink,
    },
  ],
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

// "tiny" never renders the label, so only two sizes exist.
export const titleText = styleVariants({
  compact: [titleBase, { fontSize: 10 }],
  regular: [titleBase, { fontSize: 11.5 }],
});

// Plain travel tiles read italic; alert tiles switch upright for legibility.
export const titleItalic = style({
  fontStyle: "italic",
});

export const alertIcon = style({
  flexShrink: 0,
});

export const modeIcon = style({
  flexShrink: 0,
  opacity: 0.78,
});

export const labelText = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const minutes = style({
  flexShrink: 0,
  fontWeight: 500,
  opacity: 0.7,
  fontVariantNumeric: "tabular-nums",
  paddingRight: space["1"],
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
