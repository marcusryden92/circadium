import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const dayToggles = style({
  display: "flex",
  gap: space["1.5"],
  flexWrap: "wrap",
});

// The shared drag/toggle chip vocabulary: glass when off, solid ink when on
// (same chips as the onboarding Week step's day pickers).
export const dayToggle = style([
  text.bodySm,
  {
    width: 36,
    height: 36,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    border: `1px solid ${vars.glass.stroke}`,
    background: vars.glass.bgSoft,
    color: vars.muted,
    cursor: "pointer",
    transition:
      "background 150ms ease, color 150ms ease, border-color 150ms ease",
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill, color: vars.ink },
    },
  },
]);

export const dayToggleOn = style({
  borderColor: vars.ink,
  background: vars.ink,
  color: vars.paper,
  selectors: {
    "&:hover": { background: vars.ink, color: vars.paper },
  },
});

export const rangeList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const rangeRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const rangeDash = style([
  text.bodySm,
  {
    color: vars.muted,
  },
]);

export const anyTimeNote = style([
  text.bodySm,
  {
    color: vars.muted,
    transition: themeTransition,
  },
]);

export const rowButton = style([
  text.bodySm,
  {
    border: "none",
    background: "none",
    padding: 0,
    color: vars.muted,
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": { color: vars.ink },
    },
  },
]);

export const addButton = style([
  text.bodySm,
  {
    alignSelf: "flex-start",
    border: "none",
    background: "none",
    padding: 0,
    fontWeight: 600,
    color: vars.inkSoft,
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": { color: vars.ink },
    },
  },
]);
