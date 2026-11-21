import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const menu = style([
  popover(),
  {
    zIndex: zIndex.modalOver,
    width: 280,
    maxHeight: 320,
    overflowY: "auto",
    padding: space["1"],
    display: "flex",
    flexDirection: "column",
    gap: space["px"],
  },
]);

export const stateRow = style([
  text.label,
  {
    padding: "10px 12px",
    color: vars.muted,
    textAlign: "center",
  },
]);

export const conversationRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["0.5"],
});

export const conversationButton = style({
  appearance: "none",
  background: "transparent",
  border: "none",
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: space["px"],
  padding: "6px 8px",
  borderRadius: radii.sm,
  cursor: "pointer",
  textAlign: "left",
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
    "&[data-current='true']": {
      background: vars.interactive.selectedFill,
    },
  },
});

export const conversationTitle = style([
  text.bodySm,
  {
    color: vars.ink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    transition: themeTransition,
  },
]);

export const conversationDate = style({
  fontFamily: vars.font.ui,
  fontSize: 10,
  color: vars.muted,
  transition: themeTransition,
});

export const deleteButton = style({
  appearance: "none",
  background: "transparent",
  border: "none",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: radii.sm,
  cursor: "pointer",
  color: vars.muted,
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
      color: vars.status.error,
    },
  },
});
