import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const paragraph = style([
  text.bodyLg,
  {
    color: vars.inkSoft,
    lineHeight: 1.65,
    fontWeight: 450,
    margin: `0 0 ${space["4"]}`,
    transition: themeTransition,
  },
]);

export const subhead = style([
  display.panelTitle,
  {
    color: vars.ink,
    margin: `${space["7"]} 0 ${space["3"]}`,
    selectors: {
      "&:first-child": { marginTop: 0 },
    },
    transition: themeTransition,
  },
]);

const listBase = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
  margin: `0 0 ${space["4"]}`,
  paddingLeft: space["5"],
});

export const list = style([listBase, { listStyleType: "disc" }]);
export const listOrdered = style([listBase, { listStyleType: "decimal" }]);

export const listItem = style([
  text.bodyLg,
  {
    color: vars.inkSoft,
    lineHeight: 1.6,
    fontWeight: 450,
    paddingLeft: space["1"],
    selectors: {
      "&::marker": {
        color: vars.muted,
      },
    },
  },
]);

export const terms = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  margin: `0 0 ${space["5"]}`,
});

export const termRow = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  padding: `${space["4"]} ${space["4.5"]}`,
  borderRadius: radii.md,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
  transition: themeTransition,
});

export const termName = style([
  display.listTitle,
  {
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const termDef = style([
  text.body,
  {
    margin: 0,
    color: vars.inkSoft,
    lineHeight: 1.6,
    fontWeight: 450,
    transition: themeTransition,
  },
]);

export const note = style({
  display: "flex",
  gap: space["2.5"],
  alignItems: "flex-start",
  margin: `${space["5"]} 0 ${space["4"]}`,
  padding: `${space["4"]} ${space["4.5"]}`,
  borderRadius: radii.md,
  border: `1px solid ${vars.glass.stroke}`,
  borderLeft: `3px solid ${vars.accent.primary}`,
  background: vars.glass.bgDeep,
  transition: themeTransition,
});

export const noteIcon = style({
  display: "inline-flex",
  flexShrink: 0,
  marginTop: space["0.5"],
  color: vars.accent.primary,
});

export const noteBody = style([
  text.body,
  {
    color: vars.inkSoft,
    lineHeight: 1.6,
    fontWeight: 450,
    transition: themeTransition,
  },
]);

export const strong = style({
  color: vars.ink,
  fontWeight: 650,
});

export const emphasis = style({
  fontStyle: "italic",
});
