import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

// Row primitives shared by AgendaItemRow and UncompletedItemRow. Variants
// (NOW/NEXT/TRAVEL, flash tints) live in the respective row files.
export const agendaRow = style({
  display: "grid",
  gridTemplateColumns: "72px 1fr auto",
  gap: space["3.5"],
  alignItems: "baseline",
  margin: "4px 12px",
  background: "transparent",
  border: "1px solid transparent",
  "@media": {
    [media.mobile]: {
      paddingTop: space["4"],
      paddingBottom: space["4"],
      borderBottom: "1px solid " + vars.rule,
    },
  },
});

export const agendaRowGrouped = style({
  margin: "2px 12px",
  "@media": {
    [media.mobile]: {
      margin: "0",
    },
  },
});

export const agendaTimeCol = style({
  fontFamily: vars.font.ui,
  fontVariantNumeric: "tabular-nums",
});

export const agendaTime = style([
  text.row,
  {
    fontWeight: 700,
    color: vars.ink,
    letterSpacing: "0.02em",
    transition: themeTransition,
  },
]);

export const agendaDur = style([
  text.microLabel,
  {
    color: vars.muted,
    marginTop: space["0.5"],
    fontWeight: 600,
    transition: themeTransition,
  },
]);

export const agendaTitle = style([
  text.row,
  {
    color: vars.ink,
    overflowWrap: "anywhere",
    transition: themeTransition,
  },
]);

// The title cell is a bare div in the row markup; without a min-width floor
// an unbreakable title expands the 1fr track and pushes the chevron out of
// the card.
globalStyle(`${agendaRow} > :nth-child(2)`, {
  minWidth: 0,
});

export const agendaMeta = style({
  marginTop: space["1"],
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexWrap: "wrap",
});

export const agendaMetaDimmer = style({
  color: vars.muted,
});
