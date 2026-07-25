import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii, zIndex } from "@/lib/theme/scales";
import { glass } from "@/lib/theme/recipes.css";
import {
  display,
  text,
  fieldLabel as fieldLabelPreset,
} from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const page = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
});

export const spacer = style({ flex: 1 });

export const mainGrid = style({
  display: "grid",
  gridTemplateColumns: "300px 1fr",
  gap: space["4"],
  padding: "0 28px 28px",
  flex: 1,
  minHeight: 0,
  "@media": {
    // The desktop sidebar persists through the tablet band, so the rail
    // stacks over the content well before the mobile layout kicks in.
    [media.tablet]: {
      gridTemplateColumns: "1fr",
      flex: "0 0 auto",
      minHeight: "auto",
    },
    [media.mobile]: {
      padding: `0 ${space["4"]}px`,
      gap: space["3.5"],
    },
  },
});

export const queueRail = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  gap: space["3"],
});

export const queueHead = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  padding: "0 4px",
});

export const queueTitle = style([
  display.panelTitle,
  {
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const quickAdd = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "8px 12px",
  borderRadius: radii.pill,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  transition: themeTransition,
});

export const quickAddInput = style({ flex: 1 });

export const queueList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  overflowY: "auto",
  paddingRight: space["1"],
  flex: 1,
  minHeight: 0,
});

export const queueRow = style([
  text.row,
  {
    justifyContent: "space-between",
    gap: space["2"],
    border: "none",
    background: "transparent",
    color: vars.ink,
    textAlign: "left",
  },
]);

// Re-asserts the listRow selected fill over this button's background reset
// (same specificity; this class is emitted later).
export const queueRowActive = style({
  background: vars.interactive.selectedFill,
  fontWeight: 600,
});

export const queueRowTitle = style({
  flex: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const queueRowAge = style([
  text.microLabel,
  {
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.7,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  },
]);

export const queueEmpty = style([
  text.bodySm,
  {
    padding: "24px 16px",
    textAlign: "center",
    color: vars.muted,
  },
]);

export const main = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  gap: space["3.5"],
  overflowY: "auto",
  paddingRight: space["1"],
  // Mobile moves the handler into a bottom sheet; the inline pane is hidden.
  // The CSS hide (not just the JS gate) suppresses the first-frame flash before
  // useIsMobile resolves on a client-side navigation.
  "@media": { [media.mobile]: { display: "none" } },
});

export const breadcrumb = style([
  text.label,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
  },
]);

export const card = style([
  glass({ fill: "deep", radius: "lg", shadow: "none" }),
  {
    padding: space["7"],
    display: "flex",
    flexDirection: "column",
    gap: space["5"],
  },
]);

export const itemTitle = style([
  display.pageTitle,
  {
    lineHeight: 1.1,
    color: vars.ink,
    margin: 0,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { fontSize: 22 },
      [media.landscapePhone]: { fontSize: 19 },
    },
  },
]);

export const typeGrid = style({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: space["2"],
  "@media": {
    [media.mobile]: { gridTemplateColumns: "repeat(2, 1fr)" },
    // Landscape phone: viewport is short, so keep all four cards on one row
    // to reclaim vertical space inside the sheet.
    [media.landscapePhone]: { gridTemplateColumns: "repeat(4, 1fr)" },
  },
});

export const typeCard = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: space["1"],
  padding: "14px 10px",
  borderRadius: radii.sm,
  border: `1px solid ${vars.rule}`,
  background: vars.glass.bgSoft,
  color: vars.ink,
  cursor: "pointer",
  fontFamily: vars.font.ui,
  textAlign: "center",
  transition: themeTransition,
  selectors: {
    "&:hover": { background: vars.glass.bgDeep },
  },
});

export const typeCardActive = style({
  background: vars.ink,
  color: vars.paper,
  borderColor: vars.ink,
  selectors: {
    "&:hover": { background: vars.ink },
  },
});

export const typeCardDanger = style({
  color: vars.status.error,
  borderColor: vars.status.error,
});

export const typeCardFocused = style({
  outline: `2px solid ${vars.accent.now}`,
  outlineOffset: 2,
});

export const typeCardLabel = style([
  display.sectionHead,
  {
    lineHeight: 1,
    textTransform: "uppercase",
  },
]);

export const typeCardSub = style({
  fontSize: 10.5,
  fontWeight: 500,
  opacity: 0.7,
});

// color: inherit keeps the hint legible on the inverted (ink-bg) active card.
// Hidden on touch, where the shortcut is meaningless and the shorter card
// helps the sheet fit a short landscape viewport.
export const typeCardKbd = style([
  fieldLabelPreset,
  {
    color: "inherit",
    opacity: 0.6,
    "@media": { [media.mobile]: { display: "none" } },
  },
]);

export const fieldGrid = style({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: space["3"],
  "@media": {
    [media.mobile]: { gridTemplateColumns: "1fr" },
    // Landscape phone: three fields side by side to stay above the fold.
    [media.landscapePhone]: {
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: space["2"],
    },
  },
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: space["1.5"],
  padding: "10px 14px",
  borderRadius: radii.sm,
  border: `1px solid ${vars.rule}`,
  background: vars.glass.bgSoft,
  minHeight: 72,
  transition: themeTransition,
});

export const fieldLabel = style([
  fieldLabelPreset,
  {
    transition: themeTransition,
  },
]);

// Bare field: the surrounding `field` is the box. Shared by the number
// <Input variant="bare"> and its sibling "—" placeholder span, which must
// stay pixel-identical — the doubled selector beats the bare variant's font.
export const fieldInput = style({
  fontFamily: vars.font.ui,
  height: 26,
  lineHeight: "26px",
  fontVariantNumeric: "tabular-nums",
  color: vars.ink,
  transition: themeTransition,
  selectors: {
    "&&": { fontSize: 14, fontWeight: 500 },
    "&::placeholder": { color: vars.muted, opacity: 0.6 },
  },
});

export const categoryTrigger = style([
  text.bodyLg,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    width: "100%",
    height: 26,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const categoryTriggerLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const categoryTriggerEmpty = style({
  color: vars.muted,
});

export const categoryTriggerChevron = style({
  color: vars.muted,
  flexShrink: 0,
  transition: themeTransition,
});

export const categoryDropdownWrap = style({
  position: "relative",
});

export const categoryDropdown = style({
  position: "absolute",
  top: "calc(100% + 6px)",
  left: -8,
  right: -8,
  zIndex: zIndex.floating,
  display: "flex",
  flexDirection: "column",
  maxHeight: 220,
  overflow: "auto",
  padding: space["1"],
  background: vars.paper,
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii["sm+2"],
  boxShadow: vars.shadow.panel,
  transition: themeTransition,
});

export const categoryDropdownItem = style([
  text.body,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    width: "100%",
    padding: "8px 10px",
    border: "none",
    borderRadius: radii.xs,
    background: "transparent",
    cursor: "pointer",
    color: vars.ink,
    textAlign: "left",
    transition: themeTransition,
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
    },
  },
]);

export const categoryDropdownItemActive = style({
  background: vars.glass.bgDeep,
  boxShadow: `inset 3px 0 0 ${vars.ink}`,
});

export const categoryDropdownItemMuted = style({
  color: vars.muted,
});

export const actionRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  flexWrap: "wrap",
  "@media": {
    // Mobile (in the bottom sheet): stack full-width buttons for solid touch
    // targets; the primary "Save" lands at the bottom, closest to the thumb.
    [media.mobile]: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: space["2"],
    },
    // Landscape phone: revert to a wrapping row so the short viewport isn't
    // consumed by a tall button stack.
    [media.landscapePhone]: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: space["2"],
    },
  },
});

// The flex spacer that pushes the primary actions right on desktop is inert in
// the mobile stack — drop it so it never opens a vertical gap.
export const actionSpacer = style({
  "@media": { [media.mobile]: { display: "none" } },
});

globalStyle(`${actionRow} > button`, {
  "@media": {
    [media.mobile]: { width: "100%", minHeight: 44 },
    [media.landscapePhone]: { width: "auto", minHeight: 40 },
  },
});

export const errorText = style([
  text.bodySm,
  {
    color: vars.status.error,
    padding: "0 4px",
    transition: themeTransition,
  },
]);

export const nestModalBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

// Reserves room for the prompt/confirmation so swapping between them (or
// selecting a goal) never resizes the modal. ~3 lines at the modal's 13px
// body font.
export const nestNote = style({
  minHeight: 58,
});

export const footerHint = style([
  text.microLabel,
  {
    display: "flex",
    alignItems: "center",
    gap: space["3"],
    flexWrap: "wrap",
    color: vars.muted,
    padding: "0 4px",
    transition: themeTransition,
  },
]);

// Mobile sheet body: the BottomSheet owns the surface (fill, radius, padding),
// so the handler content just needs the card's vertical rhythm without its own
// box. Tightens on a landscape phone to fit the short viewport.
export const sheetHandlerBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["5"],
  paddingTop: space["1"],
  "@media": {
    [media.landscapePhone]: { gap: space["3.5"] },
  },
});

export const emptyMain = style([
  text.bodyLg,
  {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 24px",
    textAlign: "center",
    color: vars.muted,
    gap: space["2"],
  },
]);

export const emptyMainTitle = style([
  display.modalTitle,
  {
    color: vars.ink,
    transition: themeTransition,
  },
]);
