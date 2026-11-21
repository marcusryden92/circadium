import { globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { media, space } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

const ROOT = ".circadium-calendar";

// Lets the last hours scroll clear of the floating bottom menu.
globalStyle(`${ROOT} .fc-timegrid-body`, {
  "@media": {
    [media.mobile]: {
      marginBottom: space["22"],
      borderBottom: `1px solid ${vars.rule}`,
    },
  },
});

globalStyle(`${ROOT}`, {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
});

globalStyle(`${ROOT} .fc`, {
  fontFamily: vars.font.ui,
  flex: 1,
  minHeight: 0,
});

globalStyle(`${ROOT} .fc-scrollgrid`, {
  border: "none !important",
  background: "transparent !important",
});

globalStyle(
  `${ROOT} .fc-theme-standard td, ${ROOT} .fc-theme-standard th, ${ROOT} .fc-theme-standard .fc-scrollgrid`,
  {
    borderColor: `${vars.rule} !important`,
  },
);

// FullCalendar draws the grid's outer right frame from the rightmost cells'
// right borders (the scrollgrid table itself only carries top+left). That line
// falls against the engine column's borderLeft and reads as a double rule. The
// engine column border is the intended divider, so drop the grid's right edge.
globalStyle(
  [
    `${ROOT} .fc-scrollgrid-section > td:last-child`,
    `${ROOT} .fc-col-header-cell:last-child`,
    `${ROOT} .fc-timegrid-col:last-child`,
    `${ROOT} .fc-timegrid-slot-lane:last-child`,
  ].join(", "),
  {
    borderRightWidth: "0 !important",
  },
);

globalStyle(`${ROOT} .fc-media-screen`, {
  border: "none !important",
  borderRadius: "0 !important",
});

globalStyle(`${ROOT} .fc-col-header`, {
  background: `color-mix(in srgb, ${vars.ink} 3%, transparent)`,
});

globalStyle(`${ROOT} .fc-col-header-cell`, {
  borderColor: `${vars.rule} !important`,
});

globalStyle(`${ROOT} .fc-col-header-cell-cushion`, {
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

globalStyle(`${ROOT} .fc-timegrid-axis-cushion`, {
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
});

globalStyle(`${ROOT} .fc-timegrid-slot-label-cushion`, {
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
  padding: "0 8px",
});

globalStyle(`${ROOT} .fc-timegrid-slot`, {
  height: "2.4rem !important",
  borderColor: `${vars.rule} !important`,
  "@media": {
    [media.mobile]: {
      height: "2.8rem !important",
    },
  },
});

globalStyle(`${ROOT} .fc-timegrid-col`, {
  background: "transparent !important",
});

globalStyle(`${ROOT} .fc-day-today`, {
  background: `color-mix(in srgb, ${vars.accent.now} 4%, transparent) !important`,
});

globalStyle(`${ROOT} .fc-timegrid-event-harness`, {
  border: 0,
});

globalStyle(`${ROOT} .fc-event`, {
  border: "none !important",
  borderRadius: "0 !important",
  fontFamily: vars.font.ui,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "none !important",
  transition: themeTransition,
});

globalStyle(`${ROOT} .fc-event-main`, {
  padding: "0 !important",
  background: "transparent !important",
});

globalStyle(`${ROOT} .fc-v-event`, {
  border: "none !important",
});

globalStyle(`${ROOT} .fc-bg-event`, {
  opacity: "1 !important",
  pointerEvents: "none",
});

globalStyle(`${ROOT} .fc-bg-event:hover`, {
  transform: "none",
  boxShadow: "none",
});

globalStyle(`${ROOT} .fc-timegrid-now-indicator-line`, {
  borderColor: `${vars.accent.now} !important`,
  borderWidth: "2px !important",
});

globalStyle(`${ROOT} .fc-timegrid-now-indicator-arrow`, {
  borderColor: `${vars.accent.now} !important`,
  display: "none",
});

globalStyle(`${ROOT} .fc-scroller`, {
  overflow: "auto !important",
  scrollbarWidth: "none",
  scrollbarGutter: "auto",
});

globalStyle(`${ROOT} .fc-scroller::-webkit-scrollbar`, {
  width: 0,
  height: 0,
  background: "transparent",
});

globalStyle(`${ROOT} .fc-scroller::-webkit-scrollbar-thumb`, {
  background: "transparent",
});

globalStyle(
  [
    `${ROOT} .fc-scrollgrid-sync-table`,
    `${ROOT} table.fc-col-header`,
    `${ROOT} .fc-timegrid-body`,
    `${ROOT} .fc-timegrid-slots`,
    `${ROOT} .fc-timegrid-slots > table`,
    `${ROOT} .fc-timegrid-cols`,
    `${ROOT} .fc-timegrid-cols > table`,
  ].join(", "),
  {
    width: "100% !important",
  },
);

globalStyle(`${ROOT} .fc-timegrid-daygrid-day-top`, {
  display: "none",
});

globalStyle(`${ROOT} .fc-timegrid-axis`, {
  borderColor: `${vars.rule} !important`,
});

// Touch resize handles. FullCalendar derives the dot size, position, and
// radius entirely from these custom properties, so overriding them rescales
// and re-centers the dots through FC's own math.
globalStyle(`${ROOT}`, {
  vars: {
    "--fc-event-resizer-dot-total-width": "16px",
    "--fc-event-resizer-dot-border-width": "2.5px",
    // Kill FC's dark wash on selected tiles; the ring below is the signal.
    "--fc-event-selected-overlay-color": "transparent",
  },
});

// A touch starting on a handle must never become a browser scroll — during
// the first 5px FullCalendar hasn't claimed the gesture yet, and a scroll
// there permanently cancels the resize (wasTouchScroll).
globalStyle(`${ROOT} .fc-event-resizer`, {
  touchAction: "none",
});

globalStyle(`${ROOT} .fc-event-selected .fc-event-resizer`, {
  background: `${vars.accent.primary} !important`,
  borderColor: `${vars.paper} !important`,
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
});

// FC's stock hit inset is -20px per side; with the bigger dot that would
// swallow short tiles' bodies entirely. -12px keeps a 40px target.
globalStyle(`${ROOT} .fc-event-selected .fc-event-resizer::before`, {
  top: -12,
  right: -12,
  bottom: -12,
  left: -12,
});

globalStyle(`${ROOT} .fc-event.fc-event-selected`, {
  boxShadow: `0 0 0 2px ${vars.paper}, 0 0 0 4px ${vars.accent.primary}, 0 6px 16px rgba(0, 0, 0, 0.22) !important`,
});

// Long-pressing tile text must not trigger iOS text selection / callout.
globalStyle(`${ROOT} .fc-event`, {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
});
