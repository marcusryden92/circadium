import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space, borderWidth, zIndex } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { interactiveTransition } from "@/lib/theme/transitions";

const SWATCH_SIZE = 16;
const SWATCH_GAP = 5;
// Widest family is five swatches; size the popup so each family sits on its
// own line, grouping the palette by hue without labels.
const SWATCHES_PER_ROW = 5;
const POPUP_PAD = 12;
// scrollbar-gutter: stable reserves the scrollbar's width inside the content
// box, so the swatch row must budget for it or the last swatch wraps. Covers
// the custom 7px webkit scrollbar with slack for wider native gutters.
const SCROLLBAR_GUTTER = 12;
const POPUP_WIDTH =
  SWATCHES_PER_ROW * SWATCH_SIZE +
  (SWATCHES_PER_ROW - 1) * SWATCH_GAP +
  POPUP_PAD * 2 +
  SCROLLBAR_GUTTER;
// Cap the height so the full grouped palette scrolls rather than growing the
// popover past the viewport.
const POPUP_MAX_HEIGHT = 288;

// alignSelf prevents the popover's flex-column body from stretching this
// control across the full width — it sizes to its content.
export const trigger = style([
  text.label,
  {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: space["2"],
    padding: `${space["1"]}px ${space["3"]}px ${space["1"]}px ${space["1"]}px`,
    borderRadius: radii.pill,
    background: vars.glass.bgSoft,
    border: `${borderWidth.hairline}px solid ${vars.glass.stroke}`,
    color: vars.ink,
    cursor: "pointer",
    fontWeight: 600,
  },
]);

// Background is the currently applied event color — set inline by the component.
export const triggerDot = style({
  width: 18,
  height: 18,
  borderRadius: radii.pill,
  border: `${borderWidth.hairline}px solid ${vars.glass.stroke}`,
  boxShadow: `inset 0 1px 0 ${vars.glass.hi}`,
});

export const triggerLabel = style({
  color: vars.inkSoft,
});

// Layered on top of the popover() recipe, which owns the glass surface; this
// class adds the grouped-swatch layout and scroll behavior.
export const popup = style({
  width: POPUP_WIDTH,
  maxHeight: POPUP_MAX_HEIGHT,
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarGutter: "stable",
  padding: POPUP_PAD,
  zIndex: zIndex.popoverOverPalette,
  display: "flex",
  flexDirection: "column",
  // Inter-group gap sits wider than the within-family swatch gap so each hue
  // family reads as its own block without needing a label.
  gap: space["2.5"],
});

// One color family — its swatches on a single wrapping row.
export const groupSwatches = style({
  display: "flex",
  flexWrap: "wrap",
  gap: SWATCH_GAP,
  minWidth: 0,
});

// Swatch background is the per-color value — set inline by the component.
const swatchBase = style({
  width: SWATCH_SIZE,
  height: SWATCH_SIZE,
  borderRadius: radii.pill,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  transition: interactiveTransition("transform", "box-shadow"),
});

export const swatch = styleVariants({
  active: [
    swatchBase,
    {
      border: `${borderWidth.hairline}px solid ${vars.ink}`,
      boxShadow: `0 0 0 1.5px ${vars.paper}, 0 0 0 2.5px ${vars.ink}`,
    },
  ],
  inactive: [
    swatchBase,
    {
      border: `${borderWidth.hairline}px solid ${vars.glass.stroke}`,
      boxShadow: "none",
    },
  ],
});
