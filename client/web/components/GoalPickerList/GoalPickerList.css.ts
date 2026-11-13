import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";

// Mirrors the global search palette (inputRow + scroll list), packaged as a
// self-contained bordered box so it drops into any modal body.
export const container = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii.md,
  overflow: "hidden",
  transition: themeTransition,
});

export const inputRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  padding: "10px 14px",
  borderBottom: `1px solid ${vars.rule}`,
});

export const inputIcon = style({
  display: "inline-flex",
  alignItems: "center",
  color: vars.inkSoft,
  flexShrink: 0,
});

// The search font is the one thing that differs from the bare <Input>
// default, so it wins via the doubled selector (search-palette precedent).
export const input = style({
  flex: 1,
  selectors: {
    "&&": { fontSize: 15 },
  },
});

// Fixed height so the box never resizes as results filter in and out.
export const scrollArea = style({
  height: 240,
  overflowY: "auto",
  padding: space["1"],
});

export const option = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  width: "100%",
  padding: "8px 10px",
  borderRadius: radii.xs,
  border: "none",
  background: "transparent",
  color: vars.ink,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: vars.font.ui,
  transition: interactiveTransition("background-color", "color"),
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

// Deliberately the app's selected-fill (not the palette's cursor tint): the
// mark is an explicit click, so it reads stronger than a plain hover. Holds
// through hover so a marked row never looks like it de-selects under the
// cursor.
export const optionActive = style({
  background: vars.interactive.selectedFill,
  selectors: {
    "&:hover": { background: vars.interactive.selectedFill },
  },
});

export const optionIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  color: vars.inkSoft,
  flexShrink: 0,
});

export const optionTitle = style({
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const optionCheck = style({
  flexShrink: 0,
  color: vars.ink,
});

export const emptyState = style({
  padding: "36px 14px",
  textAlign: "center",
  color: vars.muted,
  fontFamily: vars.font.ui,
  fontSize: 13,
});
