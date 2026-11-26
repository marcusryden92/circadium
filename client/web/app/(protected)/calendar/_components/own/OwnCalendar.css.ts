import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { media, space } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

// Matches the FullCalendar surface's time axis, sized to its "HH:00" labels.
export const GUTTER_WIDTH = 48;

const todayTint = `color-mix(in srgb, ${vars.accent.now} 4%, transparent)`;

export const root = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  fontFamily: vars.font.ui,
});

export const scroller = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  position: "relative",
  scrollbarWidth: "none",
  selectors: {
    "&::-webkit-scrollbar": { width: 0, height: 0, background: "transparent" },
  },
});

export const headerRow = style({
  position: "sticky",
  top: 0,
  zIndex: 6,
  display: "flex",
  background: `color-mix(in srgb, ${vars.ink} 3%, ${vars.paper})`,
  borderBottom: `1px solid ${vars.rule}`,
});

export const headerCorner = style({
  flex: `0 0 ${GUTTER_WIDTH}px`,
});

export const headerCell = style({
  flex: "1 1 0",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2px 4px",
  borderLeft: `1px solid ${vars.rule}`,
  selectors: {
    "&[data-today]": { background: todayTint },
  },
});

export const body = style({
  position: "relative",
  display: "flex",
  "@media": {
    // Lets the last hours scroll clear of the floating bottom menu.
    [media.mobile]: {
      marginBottom: space["22"],
      borderBottom: `1px solid ${vars.rule}`,
    },
  },
});

export const gutter = style({
  position: "relative",
  flex: `0 0 ${GUTTER_WIDTH}px`,
});

export const hourLabel = style({
  position: "absolute",
  right: 0,
  padding: "0 8px",
  transform: "translateY(-50%)",
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

export const columns = style({
  position: "relative",
  flex: "1 1 0",
  minWidth: 0,
  display: "flex",
  // Vertical pans stay native until a long-press turns the touch into a drag.
  touchAction: "pan-y",
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
});

export const slotLines = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
});

export const slotLine = style({
  position: "absolute",
  left: 0,
  right: 0,
  borderTop: `1px solid ${vars.rule}`,
  selectors: {
    "&[data-minor]": { borderTopStyle: "dotted" },
  },
});

export const column = style({
  position: "relative",
  flex: "1 1 0",
  minWidth: 0,
  borderLeft: `1px solid ${vars.rule}`,
  selectors: {
    "&[data-today]": { background: todayTint },
  },
});

export const backgroundLayer = style({
  position: "absolute",
  inset: 0,
  zIndex: 2,
});

export const backgroundTile = style({
  position: "absolute",
  left: 0,
  right: 0,
  pointerEvents: "none",
});

export const highlight = style({
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 3,
  pointerEvents: "none",
  background: `color-mix(in srgb, ${vars.accent.primary} 18%, transparent)`,
});

// FullCalendar insets its foreground events: 2px on the left, 2.5% on the
// right, so a click on the column's right edge always reaches the grid.
export const eventsLayer = style({
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 2,
  right: "2.5%",
  zIndex: 3,
});

export const mirrorLayer = style([eventsLayer, { zIndex: 4, pointerEvents: "none" }]);

export const tileHarness = style({
  position: "absolute",
});

export const tile = style({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 1,
  fontFamily: vars.font.ui,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&[data-tile-selected]": {
      boxShadow: `0 0 0 2px ${vars.paper}, 0 0 0 4px ${vars.accent.primary}, 0 6px 16px rgba(0, 0, 0, 0.22)`,
    },
  },
});

export const mirrorTile = style([tile, { opacity: 0.85, cursor: "grabbing" }]);

// Thin edge strips on hover-capable pointers; on touch the selected tile shows
// round handles instead (FullCalendar's touch resizers).
export const resizer = style({
  position: "absolute",
  left: 0,
  right: 0,
  height: 8,
  zIndex: 4,
  display: "none",
  selectors: {
    '&[data-resize="start"]': { top: -4, cursor: "n-resize" },
    '&[data-resize="end"]': { bottom: -4, cursor: "s-resize" },
  },
});

globalStyle(`${tile}:hover > ${resizer}`, {
  "@media": {
    "(hover: hover)": { display: "block" },
  },
});

globalStyle(`${tile}[data-tile-selected] > ${resizer}`, {
  display: "block",
  left: "50%",
  right: "auto",
  width: 16,
  height: 16,
  transform: "translateX(-50%)",
  borderRadius: "50%",
  background: vars.accent.primary,
  border: `2.5px solid ${vars.paper}`,
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
  touchAction: "none",
});

globalStyle(`${tile}[data-tile-selected] > ${resizer}[data-resize="start"]`, {
  top: -8,
});

globalStyle(`${tile}[data-tile-selected] > ${resizer}[data-resize="end"]`, {
  bottom: -8,
});

export const nowLine = style({
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 5,
  borderTop: `2px solid ${vars.accent.now}`,
  pointerEvents: "none",
});
