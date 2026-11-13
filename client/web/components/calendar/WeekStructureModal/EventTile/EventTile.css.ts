import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

// Local copy of the modal-shell fade duration so the tile's opacity transition
// stays in lockstep with mount/unmount without importing across folders.
const FADE_MS = 220;

export const eventBox = style({
  height: "100%",
  width: "100%",
  padding: "3px 6px",
  fontFamily: vars.font.ui,
  fontSize: 11,
  lineHeight: 1.15,
  color: vars.ink,
  overflow: "hidden",
  borderRadius: radii.sm,
  position: "relative",
  outline: "1.5px solid transparent",
  outlineOffset: -1,
  transition: `opacity ${FADE_MS}ms ease, filter ${FADE_MS}ms ease, outline-color 150ms ease, ${themeTransition}`,
  selectors: {
    "&[data-kind='template']": {
      color: vars.textOnAccent,
    },
    "&[data-kind='window'][data-assigned='true']": {
      color: vars.textOnAccent,
    },
    "&[data-inactive='true']": {
      opacity: 0.22,
      filter: "saturate(0.7)",
      pointerEvents: "none",
    },
    // Windows belonging to non-focused categories, dimmed but still clickable
    // when the modal is opened from a per-category context (Categories page).
    "&[data-defocused='true']": {
      opacity: 0.32,
      filter: "saturate(0.6)",
    },
    "&[data-selected='true']": {
      outlineColor: vars.status.error,
    },
  },
});

export const eventTitle = style({
  fontWeight: 700,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

export const eventTime = style({
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.04em",
  opacity: 0.85,
  fontVariantNumeric: "tabular-nums",
});
