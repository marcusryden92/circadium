import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { formInput } from "@/lib/theme/recipes.css";
import { colorMixAlpha } from "@/lib/theme/effects";
import { themeTransition } from "@/lib/theme/transitions";

export const form = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
});

export const label = style({
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: vars.muted,
});

export const input = style([formInput({ variant: "boxed" })]);

// Centered tabular-nums input for the 2FA code field.
export const codeInput = style([
  formInput({ variant: "boxed" }),
  {
    textAlign: "center",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "0.4em",
    fontVariantNumeric: "tabular-nums",
    padding: "14px 12px",
  },
]);

export const fieldError = style({
  fontSize: 11,
  color: vars.status.error,
  fontFamily: vars.font.ui,
  marginTop: space["0.5"],
});

export const forgotRow = style({
  display: "flex",
  justifyContent: "flex-end",
  marginTop: `-${space["0.5"]}`,
});

export const forgotLink = style({
  fontSize: 11,
  color: vars.muted,
  textDecoration: "none",
  fontWeight: 600,
  transition: themeTransition,
  selectors: {
    "&:hover": { color: vars.ink },
  },
});

const alertBase = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  padding: "8px 12px",
  borderRadius: radii.sm,
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const alertError = style([
  alertBase,
  {
    background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.lightFill}%, transparent)`,
    border: `1px solid ${vars.status.error}`,
    color: vars.status.error,
  },
]);

export const alertSuccess = style([
  alertBase,
  {
    background: `color-mix(in srgb, ${vars.status.success} ${colorMixAlpha.lightFill}%, transparent)`,
    border: `1px solid ${vars.status.success}`,
    color: vars.status.success,
  },
]);

export const submit = style({
  width: "100%",
  justifyContent: "center",
  marginTop: space["1"],
});
