import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { display, text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// Modal fade duration in ms â€” used by both CSS transition and the JS unmount timer.
export const MODAL_FADE_MS = 220;

export const overlay = style({
  position: "absolute",
  inset: 0,
  zIndex: 10,
  display: "flex",
  opacity: 0,
  transition: `opacity ${MODAL_FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": {
      opacity: 1,
    },
  },
});

export const modal = style({
  position: "absolute",
  inset: 0,
  zIndex: 11,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  isolation: "isolate",
  padding: 0,
  background: vars.paper,
  opacity: 0,
  transform: "translateY(8px) scale(0.995)",
  transition: `${themeTransition}, opacity ${MODAL_FADE_MS}ms ease, transform ${MODAL_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  selectors: {
    "&[data-state='open']": {
      opacity: 1,
      transform: "translateY(0) scale(1)",
    },
  },
});

export const banner = style({
  position: "relative",
  zIndex: 1,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: space["3.5"],
  padding: "8px 22px",
  background: vars.ink,
  color: vars.paper,
  transition: themeTransition,
  "@media": {
    [media.tablet]: {
      flexWrap: "wrap",
    },
    [media.mobile]: {
      padding: "8px 14px",
      gap: space["2.5"],
    },
  },
});

export const editingLabel = style([
  fieldLabel,
  {
    color: `color-mix(in srgb, ${vars.paper} 65%, transparent)`,
    transition: themeTransition,
  },
]);

export const modeToggle = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  padding: space["1"],
  borderRadius: radii.pill,
  background: `color-mix(in srgb, ${vars.paper} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.paper} 18%, transparent)`,
});

export const modeToggleThumb = style({
  position: "absolute",
  top: 3,
  bottom: 3,
  left: 3,
  width: "calc(50% - 3px)",
  borderRadius: radii.pill,
  background: vars.paper,
  transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
  zIndex: 0,
  selectors: {
    "&[data-position='1']": {
      transform: "translateX(100%)",
    },
  },
});

export const modeToggleButton = style([
  text.bodySm,
  {
    position: "relative",
    zIndex: 1,
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: "5px 18px",
    borderRadius: radii.pill,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: `color-mix(in srgb, ${vars.paper} 70%, transparent)`,
    cursor: "pointer",
    transition: `color 0.22s cubic-bezier(0.4, 0, 0.2, 1)`,
    selectors: {
      "&[data-active='true']": {
        color: vars.ink,
      },
      "&:hover:not([data-active='true'])": {
        color: vars.paper,
      },
    },
  },
]);

export const bannerSummary = style([
  text.label,
  {
    color: `color-mix(in srgb, ${vars.paper} 72%, transparent)`,
    fontVariantNumeric: "tabular-nums",
  },
]);

export const bannerSpacer = style({ flex: 1 });

export const body = style({
  position: "relative",
  zIndex: 1,
  flex: 1,
  display: "flex",
  minHeight: 0,
  overflow: "hidden",
  // Below the tablet breakpoint the fixed editor rail would crush the week
  // grid, so it becomes a bottom panel instead.
  "@media": {
    [media.tablet]: {
      flexDirection: "column",
    },
  },
});

export const gridCol = style({
  position: "relative",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  padding: "14px 18px",
  borderRight: `1px solid ${vars.rule}`,
  "@media": {
    [media.tablet]: {
      borderRight: "none",
    },
    [media.mobile]: {
      padding: "12px 14px",
    },
  },
});

export const gridHeader = style({
  display: "flex",
  alignItems: "baseline",
  flexWrap: "wrap",
  gap: space["3"],
  marginBottom: space["2"],
  flexShrink: 0,
});

export const gridTitle = style([
  display.modalTitle,
  {
    color: vars.ink,
    margin: 0,
    transition: themeTransition,
  },
]);

export const gridSubtitle = style([
  text.label,
  {
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
  },
]);

// Mobile swaps the 7-column drawable week for a single-day view; this is the
// prev / weekday / next switcher in the grid header. Hidden on wider layouts.
export const dayNav = style({
  display: "none",
  "@media": {
    [media.mobile]: {
      display: "inline-flex",
      alignItems: "center",
      gap: space["1.5"],
      marginLeft: "auto",
    },
  },
});

export const dayNavBtn = iconBtn({ size: "md" });

export const dayNavLabel = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  color: vars.ink,
  minWidth: 78,
  textAlign: "center",
});

export const calendarWrap = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: radii["md+2"],
  border: `1px solid ${vars.rule}`,
});

export const rail = style({
  width: 320,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
  "@media": {
    [media.tablet]: {
      width: "auto",
      maxHeight: "45%",
      overflowY: "auto",
      borderTop: `1px solid ${vars.rule}`,
    },
  },
});

export const emptyPanel = style({
  flexShrink: 0,
  padding: "18px 18px",
  borderBottom: `1px solid ${vars.rule}`,
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.muted,
  lineHeight: 1.5,
});

export const errorBanner = style({
  position: "relative",
  zIndex: 1,
  margin: "0 18px 12px",
  padding: "10px 14px",
  borderRadius: radii["sm+2"],
  border: `1px solid color-mix(in srgb, ${vars.status.error} 60%, transparent)`,
  background: `color-mix(in srgb, ${vars.status.error} 12%, transparent)`,
  color: vars.ink,
  fontFamily: vars.font.ui,
  fontSize: 12,
  display: "flex",
  alignItems: "flex-start",
  gap: space["2"],
});

export const errorBannerMessage = style({ flex: 1 });

export const errorDismiss = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  color: vars.muted,
  cursor: "pointer",
  padding: 0,
  display: "inline-flex",
});

// Paper text for the ghost variant on the dark ink banner.
export const cancelButtonStyle = style({
  color: `color-mix(in srgb, ${vars.paper} 80%, transparent)`,
  selectors: {
    "&:hover:not(:disabled)": {
      color: vars.paper,
    },
  },
});

export const a11yHiddenTitle = style({
  position: "absolute",
  left: -10000,
});

export const discardConfirmBody = style({
  margin: 0,
});

const FC = ".week-structure-fc";

globalStyle(`${FC}`, {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
});

globalStyle(`${FC} .fc`, {
  fontFamily: vars.font.ui,
  flex: 1,
  minHeight: 0,
});

globalStyle(`${FC} .fc-scrollgrid`, {
  border: "none !important",
  background: "transparent !important",
});

globalStyle(
  `${FC} .fc-theme-standard td, ${FC} .fc-theme-standard th, ${FC} .fc-theme-standard .fc-scrollgrid`,
  { borderColor: `${vars.rule} !important` },
);

globalStyle(`${FC} .fc-media-screen`, {
  border: "none !important",
  borderRadius: "0 !important",
});

globalStyle(`${FC} .fc-col-header`, {
  background: `color-mix(in srgb, ${vars.ink} 3%, transparent)`,
});

globalStyle(`${FC} .fc-col-header-cell`, {
  borderColor: `${vars.rule} !important`,
  padding: "8px 0",
});

// Literal fieldLabel preset values — globalStyle cannot compose classes.
globalStyle(`${FC} .fc-col-header-cell-cushion`, {
  textDecoration: "none",
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: vars.muted,
});

globalStyle(`${FC} .fc-timegrid-axis-cushion`, {
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
});

globalStyle(`${FC} .fc-timegrid-slot-label-cushion`, {
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
  padding: "0 8px",
});

globalStyle(`${FC} .fc-timegrid-slot`, {
  height: "2.2rem !important",
  borderColor: `${vars.rule} !important`,
  "@media": {
    [media.mobile]: {
      height: "2.6rem !important",
    },
  },
});

globalStyle(`${FC} .fc-timegrid-col`, {
  background: "transparent !important",
});

globalStyle(`${FC} .fc-event`, {
  border: "none !important",
  borderRadius: "0 !important",
  fontFamily: vars.font.ui,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "none !important",
  background: "transparent !important",
  transition: themeTransition,
});

globalStyle(`${FC} .fc-event-main`, {
  padding: "0 !important",
  background: "transparent !important",
});

globalStyle(`${FC} .fc-v-event`, { border: "none !important" });

globalStyle(`${FC} .fc-timegrid-event-harness`, { border: 0 });

globalStyle(`${FC} .fc-scroller`, {
  overflow: "auto !important",
  scrollbarWidth: "none",
});

globalStyle(`${FC} .fc-scroller::-webkit-scrollbar`, {
  width: 0,
  height: 0,
  background: "transparent",
});

globalStyle(
  [
    `${FC} .fc-scrollgrid-sync-table`,
    `${FC} table.fc-col-header`,
    `${FC} .fc-timegrid-body`,
    `${FC} .fc-timegrid-slots`,
    `${FC} .fc-timegrid-slots > table`,
    `${FC} .fc-timegrid-cols`,
    `${FC} .fc-timegrid-cols > table`,
  ].join(", "),
  { width: "100% !important" },
);

globalStyle(`${FC} .fc-timegrid-axis`, {
  borderColor: `${vars.rule} !important`,
});

// Touch resize handles. FullCalendar derives the dot size, position, and
// radius entirely from these custom properties, so overriding them rescales
// and re-centers the dots through FC's own math.
globalStyle(`${FC}`, {
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
globalStyle(`${FC} .fc-event-resizer`, {
  touchAction: "none",
});

globalStyle(`${FC} .fc-event-selected .fc-event-resizer`, {
  background: `${vars.accent.primary} !important`,
  borderColor: `${vars.paper} !important`,
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
});

// FC's stock hit inset is -20px per side; with the bigger dot that would
// swallow short tiles' bodies entirely. -12px keeps a 40px target.
globalStyle(`${FC} .fc-event-selected .fc-event-resizer::before`, {
  top: -12,
  right: -12,
  bottom: -12,
  left: -12,
});

globalStyle(`${FC} .fc-event.fc-event-selected`, {
  boxShadow: `0 0 0 2px ${vars.paper}, 0 0 0 4px ${vars.accent.primary}, 0 6px 16px rgba(0, 0, 0, 0.22) !important`,
});

// Long-pressing tile text must not trigger iOS text selection / callout.
globalStyle(`${FC} .fc-event`, {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
});

// While a drag hovers a spot the drop will be rejected (window overlap), the
// preview keeps following the cursor — eventAllow only marks the host, and
// this red treatment is the "can't drop here" signal. The rejection itself
// happens on release (the drop/resize handlers revert).
globalStyle(`${FC}[data-drop-invalid="true"] .fc-event-mirror`, {
  outline: `2px solid ${vars.status.error}`,
  outlineOffset: -2,
  filter: "saturate(0.35)",
});
