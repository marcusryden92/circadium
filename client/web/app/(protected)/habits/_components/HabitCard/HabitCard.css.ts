import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";

export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  padding: space["4"],
});

export const head = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const title = style({
  flex: 1,
  minWidth: 0,
  fontFamily: vars.font.ui,
  fontWeight: 600,
  fontSize: 15,
  color: vars.ink,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const headActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["1"],
});

export const iconBtn = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: radii.sm,
  color: vars.muted,
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill, color: vars.ink },
  },
});

export const itemChips = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space["1.5"],
});

export const itemChip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
  maxWidth: "100%",
  padding: `2px ${space["1.5"]} 2px ${space["2"]}`,
  borderRadius: radii.pill,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.inkSoft,
  cursor: "pointer",
  transition: "background 0.15s",
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const itemChipLabel = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 180,
});

export const itemChipRemove = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  borderRadius: radii.pill,
  color: vars.muted,
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.status.error },
  },
});

export const addItemChip = style([
  itemChip,
  {
    borderStyle: "dashed",
    background: "transparent",
    color: vars.muted,
    paddingLeft: space["1.5"],
  },
]);

export const dayGrid = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
});

export const weekRow = style({
  display: "grid",
  gridTemplateColumns: "repeat(7, 18px)",
  gap: space["1"],
  justifyContent: "start",
});

export const weekdayLabel = style({
  width: 18,
  textAlign: "center",
  fontFamily: vars.font.ui,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: vars.muted,
  userSelect: "none",
});

export const dayCell = style({
  width: 18,
  height: 18,
  borderRadius: radii.pill,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: vars.font.ui,
  fontSize: 9,
  fontWeight: 700,
  color: vars.textOnAccent,
  background: `color-mix(in srgb, ${vars.rule} 55%, transparent)`,
  selectors: {
    // No tracked item has an occurrence this day — recessed so empty-but-
    // expected days read as the only real gaps.
    "&[data-off='true']": {
      background: `color-mix(in srgb, ${vars.rule} 18%, transparent)`,
    },
    "&[data-done='true']": { background: vars.status.success },
    "&[data-today='true']": {
      boxShadow: `0 0 0 1.5px ${vars.accent.primary}`,
    },
    "&[data-pad='true']": { visibility: "hidden" },
  },
});

export const rateRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const meterTrack = style({
  flex: 1,
});

export const meterFill = style({
  height: "100%",
  borderRadius: radii.pill,
});

export const rateValue = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  color: vars.inkSoft,
  minWidth: 34,
  textAlign: "right",
});

export const statsRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
});

export const statChip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  fontFamily: vars.font.ui,
  fontSize: 12,
  color: vars.inkSoft,
});

export const streakChip = style([
  statChip,
  { color: vars.accent.now, fontWeight: 600 },
]);
