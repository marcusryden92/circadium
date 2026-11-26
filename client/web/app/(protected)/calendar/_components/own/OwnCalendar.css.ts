import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { media, space } from "@/lib/theme/scales";

// Lets the last hours scroll clear of the floating bottom menu.
export const bodyClearance = style({
  "@media": {
    [media.mobile]: {
      marginBottom: space["22"],
      borderBottom: `1px solid ${vars.rule}`,
    },
  },
});
