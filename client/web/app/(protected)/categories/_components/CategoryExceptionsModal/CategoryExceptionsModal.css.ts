import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { popover, iconBtn } from "@/lib/theme/recipes.css";
import { display, text } from "@/lib/theme/typography.css";
import { backdropFilters } from "@/lib/theme/effects";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";

const FADE_MS = 160;

export const overlay = style({
  position: "fixed",
  inset: 0,
  background: vars.overlay,
  backdropFilter: backdropFilters.palette,
  WebkitBackdropFilter: backdropFilters.palette,
  zIndex: 150,
  opacity: 0,
  transition: `opacity ${FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": { opacity: 1 },
  },
});

export const modal = style([
  popover({ size: "xl" }),
  {
    position: "fixed",
    zIndex: 151,
    top: "50%",
    left: "50%",
    width: "min(620px, calc(100vw - 32px))",
    height: "min(72vh, 500px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    fontFamily: vars.font.ui,
    color: vars.ink,
    transform: "translate(-50%, calc(-50% + 8px)) scale(0.985)",
    transition: `transform ${FADE_MS}ms ease, ${themeTransition}`,
    selectors: {
      "&[data-state='open']": {
        transform: "translate(-50%, -50%) scale(1)",
      },
    },
  },
]);

export const header = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: space["3"],
  padding: "18px 22px 14px",
  borderBottom: `1px solid ${vars.rule}`,
  flexShrink: 0,
});

export const headerText = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  minWidth: 0,
});

export const title = style([
  display.modalTitle,
  { color: vars.ink, margin: 0 },
]);

export const subtitle = style([text.bodySm, { color: vars.muted }]);

export const closeBtn = style([iconBtn(), { color: vars.muted, flexShrink: 0 }]);

export const columns = style({
  display: "flex",
  flex: 1,
  minHeight: 0,
});

export const windowList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  width: 224,
  flexShrink: 0,
  padding: space["3"],
  overflow: "auto",
  borderRight: `1px solid ${vars.rule}`,
});

export const windowRow = style([
  text.bodySm,
  {
    display: "flex",
    alignItems: "center",
    gap: space["2"],
    padding: "8px 10px",
    width: "100%",
    borderRadius: radii["sm+2"],
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    transition: interactiveTransition("background-color", "border-color"),
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
      "&[data-active='true']": {
        background: vars.interactive.selectedFill,
        borderColor: vars.glass.stroke,
      },
    },
  },
]);

export const dot = style({
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const windowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 600,
});

export const countBadge = style([
  text.microLabel,
  {
    flexShrink: 0,
    minWidth: 18,
    height: 18,
    paddingInline: space["1.5"],
    borderRadius: radii.pill,
    background: vars.interactive.selectedFill,
    color: vars.inkSoft,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontVariantNumeric: "tabular-nums",
  },
]);

export const panel = style({
  flex: 1,
  minWidth: 0,
  overflow: "auto",
  padding: space["4"],
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

export const panelHeading = style([
  text.bodySm,
  {
    fontWeight: 600,
    color: vars.ink,
    fontVariantNumeric: "tabular-nums",
    display: "flex",
    alignItems: "center",
    gap: space["2"],
  },
]);

export const empty = style([
  text.bodySm,
  {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: vars.muted,
    padding: space["6"],
  },
]);
