import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text, caption } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";
import { media } from "@/lib/theme/scales";

export const root = style([
  text.microLabel,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["0.5"],
    color: vars.muted,
    transition: themeTransition,
    "@media": {
      [media.mobile]: {
        display: "none",
      },
    },
  },
]);

export const key = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 18,
  fontFamily: vars.font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  color: vars.inkSoft,
  background: vars.glass.bgSoft,
  border: `1px solid ${vars.rule}`,
  borderRadius: radii.xs,
  padding: "2px 6px",
  // Key labels render verbatim; never inherit a caption ancestor's uppercasing.
  textTransform: "none",
  transition: themeTransition,
});

export const separator = style({
  color: vars.muted,
  fontSize: 10,
  opacity: 0.7,
  userSelect: "none",
});

export const instruction = style([caption, { marginLeft: space["1.5"] }]);
