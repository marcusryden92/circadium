import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii, zIndex } from "@/lib/theme/scales";
import { glass, pillBtn, iconBtn } from "@/lib/theme/recipes.css";
import {
  display,
  text,
  fieldLabel,
  statusTag,
} from "@/lib/theme/typography.css";
import {
  themeTransition,
  collapseTransition,
  DURATIONS,
} from "@/lib/theme/transitions";

export const page = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
});

// Height of the fixed CornerActions buttons (search / AI). The mobile title
// row matches it so the date reads as sitting between them.
const CORNER_ACTION_SIZE = 44;

export const titleContainer = style({
  display: "flex",
  flexDirection: "column",
});

export const subHeader = style({
  display: "flex",
  alignItems: "center",
  // Gap matches MAIN_GRID_GAP so the action cluster's right edge lines up with
  // the calendar card's right edge (the wedge below absorbs the engine column
  // width minus this gap pair).
  gap: space["4"],
  padding: `15px ${space["7"]}px ${space["3"]}px`,
  flexShrink: 0,
  minWidth: 0,
  "@media": {
    [media.tablet]: {
      flexWrap: "wrap",
    },
    // Two stacked rows instead of the wrapping desktop row: the date
    // centered in the corner-actions band, then a single toolbar row — nav
    // (chevrons + Today) on the left, week structure / regenerate / engine
    // cog on the right. The hover chip, spacer, and console wedge drop out
    // (no hover on touch, nothing to align with). Top padding mirrors
    // CornerActions' fixed offset so the title row shares its band.
    [media.mobile]: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gridTemplateAreas: `"title title" "nav actions"`,
      rowGap: space["3"],
      padding: `calc(${space["3"]}px + env(safe-area-inset-top, 0px)) ${space["4"]}px ${space["3"]}px`,
    },
    // Landscape phone: collapse to one inline toolbar row (the CornerActions
    // pills are hidden here, so the full width is free) to reclaim the height
    // the stacked title row costs.
    [media.landscapePhone]: {
      display: "flex",
      justifyContent: "space-between",
    },
  },
});

export const rangeTitle = style([
  display.statCard,
  {
    color: vars.ink,
    lineHeight: 1,
    margin: 0,
    minWidth: 200,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        gridArea: "title",
        justifySelf: "center",
        display: "flex",
        alignItems: "center",
        height: CORNER_ACTION_SIZE,
        fontSize: 28,
        minWidth: "auto",
      },
      [media.landscapePhone]: { display: "none" },
    },
  },
]);

// The landscape-phone copy of the range title. Hidden by default (desktop +
// portrait show the primary rangeTitle instead); only surfaces inline in the
// single-row landscape header. Base display:none must not be re-shown under
// media.mobile — that query also matches a landscape phone and would win by
// source order.
export const rangeTitleLandscape = style([
  display.pageTitle,
  {
    color: vars.ink,
    lineHeight: 1,
    margin: 0,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
    display: "none",
    "@media": {
      [media.landscapePhone]: {
        gridArea: "title",
        justifySelf: "center",
        display: "flex",
        alignItems: "center",
        height: CORNER_ACTION_SIZE,
        fontSize: 28,
        minWidth: "auto",
      },
    },
  },
]);

export const dayHeaderStack = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "4px 0",
  "@media": {
    [media.mobile]: {
      flexDirection: "row",
      gap: space["2"],
    },
  },
});

export const dayHeaderLabel = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

export const dayHeaderNum = style([
  display.modalTitle,
  {
    lineHeight: 1,
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        fontSize: vars.font.ui,
      },
    },
  },
]);

export const dayHeaderNumToday = style({
  color: vars.accent.now,
});

export const dayHeaderLabelToday = style({
  color: vars.accent.now,
});

export const navCluster = style({
  display: "flex",
  gap: space["1"],
  marginLeft: space["1.5"],
  marginRight: "auto",
  "@media": {
    [media.mobile]: {
      gridArea: "nav",
      justifySelf: "start",
      marginLeft: 0,
      gap: space["2"],
    },
    [media.landscapePhone]: {
      marginRight: 0,
    },
  },
});

// Compact 40px-tall header buttons on mobile; natural width, no stretching.
export const headerActionBtn = style({
  "@media": {
    [media.mobile]: { height: 40 },
  },
});

// Square 1:1 variant for icon-only header buttons (week structure,
// regenerate, chevrons).
export const headerIconBtn = style({
  "@media": {
    [media.mobile]: {
      width: 40,
      height: 40,
      padding: 0,
      justifyContent: "center",
      flexShrink: 0,
    },
  },
});

// Week structure / Regenerate keep their labels on desktop; mobile shows
// the icons alone so the whole toolbar fits one row.
export const actionLabel = style({
  "@media": {
    [media.mobile]: { display: "none" },
  },
});

// Hovered-category chip in the header. Shrinks and truncates before it can
// push the fixed clusters to its right out of the row.
export const hoverChip = style([
  text.bodySm,
  {
    position: "absolute",
    right: space["4"],
    top: space["14"],
    display: "inline-flex",
    alignItems: "center",
    padding: `${space["0.5"]}px ${space["4"]}px`,
    borderRadius: radii.pill,
    gap: space["1.5"],
    color: vars.inkSoft,
    border: "1px solid " + vars.rule,
    backgroundColor: `color-mix(in srgb, ${vars.paper} 80%, transparent)`,
    fontWeight: 600,
    letterSpacing: "0.01em",
    minWidth: 0,
    flexShrink: 1,
    zIndex: 10,
    "@media": {
      [media.mobile]: { display: "none" },
    },
  },
]);

export const hoverChipDot = style({
  width: 8,
  height: 8,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const hoverChipName = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const actionCluster = style({
  display: "flex",
  alignItems: "center",
  // eslint-disable-next-line theme/no-raw-scale-values
  marginRight: 48,
  gap: space["2"],
  flexShrink: 0,
  "@media": {
    [media.mobile]: { gridArea: "actions", marginRight: 0 },
  },
});

const COG_WIDTH = 32;
const ENGINE_COL_WIDTH = 340;

export const headerEngineLabel = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  paddingBottom: space["3"],
  borderBottom: `1px solid ${vars.rule}`,
  whiteSpace: "nowrap",
  opacity: 1,
  fontSize: 18,
  transition: collapseTransition,
  selectors: {
    [`${page}[data-console-collapsed="true"] &`]: {
      opacity: 0,
    },
    [`${page}[data-no-transitions="true"] &`]: {
      transition: "none",
    },
  },
});

export const engineCogBtn = style([
  pillBtn({ variant: "glass", size: "sm" }),
  {
    position: "absolute",
    top: 15,
    right: 15,
    width: COG_WIDTH,
    height: COG_WIDTH,
    justifyContent: "center",
    padding: 0,
    zIndex: 10,
    flexShrink: 0,
    "@media": {
      [media.mobile]: {
        position: "relative",
        top: "auto",
        right: "auto",
        width: 40,
        height: 40,
      },
    },
  },
]);

export const engineCogAlertDot = style({
  position: "absolute",
  top: 3,
  right: 3,
  width: 7,
  height: 7,
  borderRadius: radii.pill,
  border: `1.5px solid ${vars.paper}`,
  transition: themeTransition,
});

export const calendarRegion = style({
  position: "relative",
  display: "flex",
  flex: 1,
  minHeight: 0,
});

export const mainGrid = style({
  position: "relative",
  display: "grid",
  gridTemplateRows: "auto 1fr",
  flex: 1,
  minHeight: 0,
  transition: `gap ${DURATIONS.collapse}s ease`,
  selectors: {
    [`${page}[data-console-collapsed="true"] &`]: {
      gap: 0,
    },
    [`${page}[data-no-transitions="true"] &`]: {
      transition: "none",
    },
  },
  "@media": {
    // Engine column is an absolute overlay here (out of flow), so the grid
    // collapses to the calendar track alone.
    [media.laptop]: {
      gridTemplateRows: "auto 1fr",
      gap: 0,
    },
    // Full-bleed on mobile: the calendar card is the only track and runs to
    // the content edges; the shell's mainColumn bottom padding keeps it clear
    // of the floating tab bar.
    [media.mobile]: {
      gridTemplateRows: "auto 1fr",
      padding: 0,
    },
  },
});

export const calendarCard = style([
  glass({ fill: "regular", radius: "none", shadow: "none", blur: "none" }),
  {
    display: "flex",
    flexDirection: "column",
    position: "relative",
    minHeight: 0,
    overflow: "hidden",
    borderRight: "none !important",
    borderBottom: "none !important",
    borderLeft: "none !important",
    "@media": {
      [media.mobile]: {
        borderRadius: 0,
        borderLeftWidth: 0,
        borderRightWidth: 0,
      },
    },
  },
]);

export const engineCol = style({
  width: ENGINE_COL_WIDTH,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  opacity: 1,
  transition: collapseTransition,
  borderLeft: "1px solid " + vars.rule,
  selectors: {
    [`${page}[data-console-collapsed="true"] &`]: {
      width: 0,
      opacity: 0,
      pointerEvents: "none",
    },
    [`${page}[data-no-transitions="true"] &`]: {
      transition: "none",
    },
  },
  "@media": {
    // Between mobile and laptop there is no room for a docked 340px column
    // next to a usable week grid — the console floats over the calendar's
    // right edge instead. Mobile drops the docked column entirely; the cog
    // opens the console as a bottom sheet.
    [media.laptop]: {
      position: "absolute",
      top: 0,
      right: 28,
      bottom: 28,
      zIndex: zIndex.raised,
    },
    [media.mobile]: {
      display: "none",
    },
  },
});

export const engineContainer = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  paddingBottom: space["12"],
  paddingLeft: space["4"],
  paddingRight: space["4"],
  // eslint-disable-next-line theme/no-raw-scale-values
  paddingTop: 15,
  width: 340,
  minWidth: 340,
  boxSizing: "border-box",
  "@media": {
    // Panel chrome for the overlay state — floats over the calendar card.
    [media.laptop]: {
      padding: space["4"],
      marginTop: space["16"],
      background: vars.paper,
      border: `1px solid ${vars.rule}`,
      borderRadius: radii.lg,
      boxShadow: vars.shadow.panel,
    },
  },
});

export const engineHeader = style({
  padding: "0 0 14px",
  flexShrink: 0,
  marginTop: space["3.5"],
  marginBottom: space["3.5"],
  display: "flex",
  justifyContent: "space-between",
  gap: space["1"],
});

export const engineTitle = style([
  display.modalTitle,
  {
    minHeight: 32,
    marginBottom: -space["1"],
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const engineLastRun = style([
  text.microLabel,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const engineSummary = style([
  text.label,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const engineList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2.5"],
  minHeight: 0,
  flex: 1,
  overflowY: "auto",
  paddingRight: space["1"],
});

// Divider-row toggle for the dismissed-messages section at the tail of the
// list; the dismissed cards render dimmed beneath it with a restore action.
export const engineDismissedToggle = style([
  text.microLabel,
  {
    alignSelf: "flex-start",
    marginTop: space["1"],
    padding: "4px 0",
    border: "none",
    background: "transparent",
    color: vars.muted,
    cursor: "pointer",
    transition: themeTransition,
    ":hover": {
      color: vars.inkSoft,
    },
  },
]);

export const engineCardDismissed = style({
  opacity: 0.55,
});

export const engineControls = style({
  flexShrink: 0,
  marginTop: space["3.5"],
  paddingTop: space["3.5"],
  borderTop: `1px solid ${vars.rule}`,
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  transition: themeTransition,
});

export const engineControlsTitle = style([
  fieldLabel,
  {
    transition: themeTransition,
  },
]);

export const controlRow = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const controlHead = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: space["2"],
});

export const controlLabel = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

export const controlValue = style([
  text.microLabel,
  {
    fontWeight: 600,
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    transition: themeTransition,
  },
]);

export const controlSlider = style({
  WebkitAppearance: "none",
  appearance: "none",
  width: "100%",
  height: 4,
  borderRadius: radii.pill,
  background: vars.glass.bgDeep,
  border: `1px solid ${vars.rule}`,
  outline: "none",
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&::-webkit-slider-thumb": {
      WebkitAppearance: "none",
      appearance: "none",
      width: 14,
      height: 14,
      borderRadius: radii.pill,
      background: vars.ink,
      border: `2px solid ${vars.paper}`,
      cursor: "pointer",
    },
    "&::-moz-range-thumb": {
      width: 14,
      height: 14,
      borderRadius: radii.pill,
      background: vars.ink,
      border: `2px solid ${vars.paper}`,
      cursor: "pointer",
    },
  },
});

export const engineCard = style({
  position: "relative",
  padding: "10px 12px",
  borderRadius: radii["sm+2"],
  border: `1px solid ${vars.rule}`,
  background: "transparent",
  transition: themeTransition,
});

// Whole-card link overlay when the payload references a planner. Sits under
// the dismiss button so a click on × doesn't accidentally navigate.
export const engineCardLink = style({
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  color: "transparent",
  textDecoration: "none",
  cursor: "pointer",
  zIndex: 0,
  ":focus-visible": {
    outline: `2px solid ${vars.accent.primary}`,
    outlineOffset: 2,
  },
});

// Card content sits above the link overlay so text remains selectable and
// the dismiss button remains clickable.
export const engineCardContent = style({
  position: "relative",
  zIndex: 1,
  pointerEvents: "none",
});

// `pointer-events: auto` restores clickability against the parent's
// disabled events set on engineCardContent.
const engineCardActionBtn = style([
  iconBtn({ size: "sm" }),
  {
    position: "absolute",
    top: 6,
    zIndex: 2,
    pointerEvents: "auto",
    opacity: 0.65,
    ":hover": {
      opacity: 1,
    },
    ":focus-visible": {
      outline: `2px solid ${vars.accent.primary}`,
      outlineOffset: 1,
    },
  },
]);

export const engineDismissBtn = style([engineCardActionBtn, { right: 6 }]);

export const engineGoToBtn = style([engineCardActionBtn, { right: 32 }]);

export const engineCardHead = style({
  display: "flex",
  alignItems: "flex-start",
  gap: space["2"],
  flexWrap: "wrap",
  // Reserve space for the absolute-positioned buttons in the top-right
  // corner (dismiss + optional go-to) so a long title wraps before it slides
  // under either. Sized for both buttons; cards without a go-to have a bit
  // of extra breathing room, which reads consistently.
  paddingRight: space["12"],
});

export const engineTag = style([
  statusTag,
  {
    padding: "2px 8px",
    borderRadius: radii.pill,
    color: vars.textOnAccent,
  },
]);

export const engineCardTitle = style([
  text.row,
  {
    color: vars.ink,
    lineHeight: 1.25,
    flex: 1,
    minWidth: 0,
    transition: themeTransition,
  },
]);

export const engineCardBody = style([
  text.label,
  {
    color: vars.inkSoft,
    marginTop: space["1.5"],
    lineHeight: 1.45,
    transition: themeTransition,
  },
]);

export const fcWrap = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  "@media": {
    [media.mobile]: { borderRadius: 0 },
  },
});
