import { style, globalStyle } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";

export const matrixWrap = style({
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii["sm+2"],
  overflow: "auto",
  background: vars.glass.bgSoft,
  transition: themeTransition,
});

export const matrixTable = style({
  borderCollapse: "separate",
  borderSpacing: 0,
  width: "100%",
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.ink,
});

// Trace highlight motion â€” fast enough to track a cursor moving across the
// matrix without lag, but with a touch of easing so it doesn't snap.
const TRACE_TRANSITION =
  "background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)";

// Headers tint via a ::before overlay (instead of swapping background-color
// directly) so the element's own bg-color keeps the slow themeTransition for
// light/dark swaps. The overlay's opacity is what animates at trace speed.
const HEADER_OVERLAY_BASE = {
  content: '""',
  position: "absolute",
  inset: 0,
  background: vars.ink,
  opacity: 0,
  pointerEvents: "none",
  transition: "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

const headerCellBase = style({
  padding: "10px 12px",
  borderBottom: `1px solid ${vars.glass.stroke}`,
  // surface.content, not paper: dark-mode paper is darker than the page
  // surface, so the sticky header/rail cells read as dark bands.
  background: vars.surface.content,
  textAlign: "center",
  verticalAlign: "middle",
  minWidth: 96,
  position: "sticky",
  // -1px, not 0: at fractional scroll offsets the browser can paint a stuck
  // header a sub-pixel low, letting a hairline of the scrolled rows shine
  // through above it. Overshooting by a pixel clips 1px of padding instead.
  top: -1,
  zIndex: 2,
  transition: themeTransition,
  selectors: {
    "&::before": HEADER_OVERLAY_BASE,
    "&[data-trace='trail']::before": { opacity: 0.08 },
  },
});

export const headerCell = style([
  headerCellBase,
  {
    fontWeight: 600,
    fontSize: 12,
    color: vars.ink,
  },
]);

export const cornerCell = style([
  headerCellBase,
  fieldLabel,
  {
    borderRight: `1px solid ${vars.glass.stroke}`,
    left: -1,
    zIndex: 3,
  },
]);

export const headerCellInner = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space["1.5"],
  // Lifted above the header's ::before trace overlay so the text isn't
  // painted underneath the tint.
  position: "relative",
  zIndex: 1,
});

export const rowHeaderCell = style({
  padding: "10px 12px",
  borderTop: `1px solid ${vars.glass.stroke}`,
  borderRight: `1px solid ${vars.glass.stroke}`,
  background: vars.surface.content,
  fontWeight: 600,
  textAlign: "center",
  verticalAlign: "middle",
  position: "sticky",
  left: -1,
  zIndex: 1,
  transition: themeTransition,
  selectors: {
    "&::before": HEADER_OVERLAY_BASE,
    "&[data-trace='trail']::before": { opacity: 0.08 },
  },
});

export const cell = style({
  padding: 0,
  borderTop: `1px solid ${vars.glass.stroke}`,
  verticalAlign: "stretch",
  transition: themeTransition,
});

// All cells share this min-height so toggling between time-varying modes
// (3 stacked values) and single-value modes (1 number) doesn't reflow rows.
const CELL_MIN_HEIGHT = 78;

export const cellButton = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: space["0.5"],
  width: "100%",
  height: "100%",
  minHeight: CELL_MIN_HEIGHT,
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: vars.font.ui,
  fontVariantNumeric: "tabular-nums",
  textAlign: "left",
  color: vars.ink,
  transition: interactiveTransition("background-color"),
  selectors: {
    "&:hover": { background: vars.glass.bgDeep },
  },
});

export const cellSelf = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: CELL_MIN_HEIGHT,
  padding: "8px 12px",
  color: vars.muted,
  background: vars.glass.bgSoft,
  textAlign: "center",
  fontSize: 12,
  transition: TRACE_TRANSITION,
});

export const periodRow = style({
  display: "inline-flex",
  alignItems: "baseline",
  gap: space["1.5"],
  lineHeight: 1.2,
});

export const periodValue = recipe({
  base: {
    fontWeight: 700,
    fontSize: 12.5,
    fontVariantNumeric: "tabular-nums",
  },
  variants: {
    tone: {
      rush: { color: vars.status.error },
      regular: { color: vars.ink },
      night: { color: vars.muted },
    },
  },
});

export const singleValue = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "center",
  gap: space["1.5"],
  width: "100%",
  lineHeight: 1.2,
});

export const singleValueNumber = style({
  fontWeight: 700,
  fontSize: 16,
  color: vars.ink,
  fontVariantNumeric: "tabular-nums",
});

export const singleValueUnit = style({
  fontSize: 10.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: vars.muted,
  fontWeight: 600,
});

export const periodLabel = style([
  fieldLabel,
  {
    letterSpacing: "0.08em",
  },
]);

globalStyle(`${cell}[data-custom="true"] > button`, {
  background: `color-mix(in srgb, ${vars.status.warning} 12%, transparent)`,
});

globalStyle(`${cell}[data-custom="true"] > button:hover`, {
  background: `color-mix(in srgb, ${vars.status.warning} 20%, transparent)`,
});

// Crosshair trace â€” hovered cell ("active") and the row/column lead-in cells
// + their headers ("trail"). Applied to the inner button OR self-div via the
// universal child selector so both render the same way.
globalStyle(`${cell}[data-trace="active"] > *`, {
  background: `color-mix(in srgb, ${vars.ink} 14%, transparent)`,
});

globalStyle(`${cell}[data-trace="trail"] > *`, {
  background: `color-mix(in srgb, ${vars.ink} 7%, transparent)`,
});

export const missingBlock = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: space["0.5"],
});

export const missingLabel = style({
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: vars.status.error,
  fontWeight: 700,
});

export const missingHint = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  fontSize: 10,
  color: vars.muted,
  fontWeight: 500,
});
