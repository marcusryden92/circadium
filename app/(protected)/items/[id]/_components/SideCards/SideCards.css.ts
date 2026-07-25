import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, zIndex } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { popover } from "@/lib/theme/recipes.css";
import { backdropFilters } from "@/lib/theme/effects";
import { themeTransition, DURATIONS } from "@/lib/theme/transitions";

export const card = style({
  padding: "12px 0",
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
  selectors: {
    "&:last-child": { borderBottom: "none" },
  },
});

export const cardSectionTitle = style([
  display.listTitle,
  {
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const nextCardHeaderRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["2"],
  marginBottom: space["2"],
});

export const nextCardLink = style([
  text.microLabel,
  {
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars.muted,
    textDecoration: "none",
    transition: themeTransition,
    selectors: {
      "&:hover": { color: vars.ink },
    },
  },
]);

export const nextCardTitle = style([
  display.panelTitle,
  {
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const nextCardSub = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    marginTop: space["0.5"],
    transition: themeTransition,
  },
]);

export const nextCardBody = style({
  // Reserves room for title (~22px) + marginTop (2) + sub (~17px) so the
  // empty "Not scheduled yet" state takes the same vertical space.
  minHeight: 42,
});

export const whyText = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    marginTop: space["1.5"],
    lineHeight: 1.5,
    transition: themeTransition,
  },
]);

const depGroupLabelBase = style([
  text.microLabel,
  {
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars.muted,
    transition: themeTransition,
  },
]);

export const depGroupLabel = style([
  depGroupLabelBase,
  {
    display: "block",
    marginTop: space["2.5"],
    marginBottom: space["1"],
  },
]);

// Group label + its inline add affordance on one line ("Depends on   + Add").
export const depGroupHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["2"],
  marginTop: space["2.5"],
  marginBottom: space["1"],
});

export const depGroupHeaderLabel = depGroupLabelBase;

export const depAddBtn = style([
  text.microLabel,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["1"],
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars.muted,
    background: "transparent",
    border: "none",
    padding: "2px 0",
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": { color: vars.ink },
    },
  },
]);

// Quiet single-line structural action (nest under a goal) — the card border
// comes from the shared card style; this is just the row.
export const nestActionRow = style([
  text.bodySm,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    width: "100%",
    fontWeight: 600,
    color: vars.inkSoft,
    background: "transparent",
    border: "none",
    padding: "6px 0",
    cursor: "pointer",
    textAlign: "left",
    transition: themeTransition,
    selectors: {
      "&:hover": { color: vars.ink },
    },
  },
]);

export const nestModalBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

// The resting card is a single count row; the full relation lists live in
// the connections modal, which scrolls as a whole.
export const connectionsRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  width: "100%",
  background: "transparent",
  border: "none",
  padding: "2px 0",
  cursor: "pointer",
  textAlign: "left",
  color: vars.inkSoft,
  transition: themeTransition,
  selectors: {
    "&:hover": { color: vars.ink },
  },
});

export const connectionsCount = style([
  text.bodySm,
  {
    marginLeft: "auto",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: "inherit",
  },
]);

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const slideUp = keyframes({
  from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

// Desktop shell for the connections modal — the DependencyPickerModal's
// overlay/dialog treatment. Overlay and content share a z-index tier; the
// content renders after the overlay, and a picker opened on top stacks by
// portal order.
export const connOverlay = style({
  position: "fixed",
  inset: 0,
  background: vars.overlay,
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  zIndex: zIndex.modal,
  animationName: fadeIn,
  animationDuration: `${DURATIONS.modal}s`,
  animationTimingFunction: "ease",
});

export const connDialog = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: zIndex.modal,
    top: "16%",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    width: "min(520px, calc(100vw - 32px))",
    maxHeight: "min(560px, calc(100vh - 26%))",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animationName: slideUp,
    animationDuration: `${DURATIONS.modal}s`,
    animationTimingFunction: "ease",
  },
]);

export const connHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  padding: "14px 16px 10px",
  borderBottom: `1px solid ${vars.rule}`,
});

export const connTitle = style([
  display.listTitle,
  {
    color: vars.ink,
    margin: 0,
    transition: themeTransition,
  },
]);

export const connBody = style({
  padding: "6px 16px 14px",
  overflowY: "auto",
  flex: 1,
  minHeight: 0,
});

export const depRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "4px 0",
  minWidth: 0,
});

export const depTitleLink = style([
  text.bodySm,
  {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    color: vars.ink,
    textDecoration: "none",
    transition: themeTransition,
    selectors: {
      "&:hover": { textDecoration: "underline" },
    },
  },
]);

export const depRemove = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  border: "none",
  background: "transparent",
  borderRadius: 4,
  color: vars.muted,
  cursor: "pointer",
  flexShrink: 0,
  transition: themeTransition,
  selectors: {
    "&:hover": {
      color: vars.ink,
      background: vars.interactive.hoverFill,
    },
  },
});

export const depError = style([
  text.bodySm,
  {
    color: vars.status.error,
    marginTop: space["1.5"],
    lineHeight: 1.45,
  },
]);

export const depEmpty = style([
  text.bodySm,
  {
    color: vars.muted,
    padding: "2px 0",
  },
]);
