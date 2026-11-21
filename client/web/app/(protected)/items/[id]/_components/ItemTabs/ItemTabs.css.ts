import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const tabsStrip = style({
  display: "flex",
  gap: space["1.5"],
  marginTop: space["6"],
  borderBottom: `1px solid ${vars.rule}`,
  flexWrap: "wrap",
  alignItems: "flex-end",
});

export const tab = style([
  text.body,
  {
    padding: "10px 16px",
    fontWeight: 600,
    color: vars.inkSoft,
    borderBottom: "2px solid transparent",
    marginBottom: `-${space["px"]}`,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: space["1.5"],
    transition: themeTransition,
    selectors: {
      "&:hover": {
        color: vars.ink,
      },
    },
    "@media": {
      [media.mobile]: { padding: "8px 10px" },
    },
  },
]);

export const tabActive = style({
  color: vars.ink,
  borderBottomColor: vars.accent.now,
});

export const tabCount = style([
  text.label,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
  },
]);

export const tabDisabled = style({
  color: vars.muted,
  opacity: 0.45,
  cursor: "not-allowed",
  pointerEvents: "none",
});

export const tabSpacer = style({ flex: 1 });

export const assistantTrigger = style([
  text.bodySm,
  {
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: "10px 14px",
    marginBottom: `-${space["px"]}`,
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: vars.inkSoft,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: space["1.5"],
    borderBottom: "2px solid transparent",
    transition: themeTransition,
    selectors: {
      "&:hover": {
        color: vars.ink,
      },
    },
  },
]);
