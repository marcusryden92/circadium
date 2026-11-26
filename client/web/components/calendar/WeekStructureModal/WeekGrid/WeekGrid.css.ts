import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { resizer, tile } from "@/components/calendar/timeGrid/timeGrid.css";

// The reference-week grid's own pieces on top of the shared time-grid shell.

export const root = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
});

// Literal fieldLabel preset values, as the FullCalendar header used.
export const dayLabel = style({
  padding: "6px 0",
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: vars.muted,
});

// Blocks of the mode not being edited stay visible but let presses through
// to the grid, so a window can be drawn over templates and vice versa.
export const tileHarness = style({
  position: "absolute",
  selectors: {
    "&[data-inactive]": { pointerEvents: "none" },
  },
});

export const tileBody = style({
  position: "absolute",
  inset: 0,
  bottom: 1,
});

// A drop here would be rejected (a window overlapping another, or a block
// past 24h): the preview keeps following the pointer, painted as refused,
// and the release reverts.
export const invalid = style({
  outline: `2px solid ${vars.status.error}`,
  outlineOffset: -2,
  filter: "saturate(0.35)",
});

export const createHighlight = style({
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 3,
  pointerEvents: "none",
  background: `color-mix(in srgb, ${vars.accent.primary} 18%, transparent)`,
  selectors: {
    "&[data-invalid]": {
      background: `color-mix(in srgb, ${vars.status.error} 22%, transparent)`,
    },
  },
});

// The touch handles are 16px dots; with a bare dot the target is too small
// for a finger, and FullCalendar's stock -20px inset would swallow short
// tiles' bodies. -12px keeps a 40px target (the modal's earlier tuning).
globalStyle(`${root} ${tile}[data-tile-selected] > ${resizer}::before`, {
  content: '""',
  position: "absolute",
  top: -12,
  right: -12,
  bottom: -12,
  left: -12,
});
