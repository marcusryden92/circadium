import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";

export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  padding: space["4"],
  cursor: "pointer",
  transition: "background 0.15s",
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
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

export const meta = style({
  display: "flex",
  gap: space["2"],
  flexWrap: "wrap",
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

export const historyStrip = style({
  display: "flex",
  gap: space["1"],
  flexWrap: "wrap",
});

const historyCellBase = style({
  width: 12,
  height: 12,
  borderRadius: 3,
  background: vars.rule,
});

export const historyCell = styleVariants({
  completed: [historyCellBase, { background: vars.status.success }],
  missed: [
    historyCellBase,
    {
      background: `color-mix(in srgb, ${vars.status.error} 45%, transparent)`,
    },
  ],
  pending: [
    historyCellBase,
    { background: "transparent", border: `1px solid ${vars.rule}` },
  ],
});
