import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "./tokens.css";

const baseDisplay = style({
  fontFamily: vars.font.display,
  fontWeight: 500,
  fontFeatureSettings: '"tnum" 1',
  letterSpacing: 0,
});

const baseUI = style({
  fontFamily: vars.font.ui,
});

export const display = styleVariants({
  hero: [baseDisplay, { fontSize: 56 }],
  bigStat: [baseDisplay, { fontSize: 44 }],
  pageTitle: [baseDisplay, { fontSize: 32 }],
  statCard: [baseDisplay, { fontSize: 26 }],
  modalTitle: [baseDisplay, { fontSize: 22 }],
  sectionHead: [baseDisplay, { fontSize: 20 }],
  panelTitle: [baseDisplay, { fontSize: 18 }],
  listTitle: [baseDisplay, { fontSize: 16 }],
});

export const text = styleVariants({
  body: [baseUI, { fontSize: 13, fontWeight: 500 }],
  bodyLg: [baseUI, { fontSize: 14, fontWeight: 500 }],
  bodySm: [baseUI, { fontSize: 12.5, fontWeight: 500 }],
  row: [baseUI, { fontSize: 13, fontWeight: 500 }],
  label: [baseUI, { fontSize: 11.5, fontWeight: 500 }],
  microLabel: [baseUI, { fontSize: 11, fontWeight: 500 }],
});

export const caption = style([
  baseUI,
  {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.10em",
    color: vars.inkSoft,
    opacity: 0.85,
  },
]);

export const fieldLabel = style([
  baseUI,
  {
    fontSize: 9.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: vars.muted,
  },
]);

export const statusTag = style([
  baseUI,
  {
    fontSize: 9.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
]);
