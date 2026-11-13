import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

export const card = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
  padding: "12px 2px",
  borderBottom: `1px solid ${vars.rule}`,
  color: vars.ink,
  cursor: "pointer",
  transition: themeTransition,
});

export const cardSelected = style({
  background: vars.interactive.selectedFill,
});

export const cardCheck = style({
  display: "flex",
  alignItems: "center",
  alignSelf: "stretch",
  flexShrink: 0,
  // Pads the tap target out to ~40px without growing the visible box.
  padding: "0 6px 0 2px",
  margin: "-12px 0",
});

export const cardCheckbox = style({
  selectors: {
    "&&": {
      width: 18,
      height: 18,
    },
  },
});

export const cardMain = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const cardTitle = style({
  fontFamily: vars.font.ui,
  fontSize: 14.5,
  fontWeight: 500,
  color: vars.ink,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  minWidth: 0,
});

export const cardMeta = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: `${space["1"]}px ${space["2.5"]}px`,
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.inkSoft,
});

export const cardMetaItem = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  fontVariantNumeric: "tabular-nums",
  minWidth: 0,
});

export const cardMetaOverdue = style({
  color: vars.status.error,
  fontWeight: 600,
});

export const cardMetaCategoryName = style({
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  maxWidth: 140,
});

export const cardSide = style({
  display: "flex",
  alignItems: "center",
  gap: space["1"],
  color: vars.muted,
  flexShrink: 0,
});

export const cardMenuBtn = style({
  color: vars.muted,
  selectors: {
    '&[data-state="open"]': {
      color: vars.ink,
      background: vars.interactive.hoverFill,
    },
  },
});
