import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";


export const masthead = style({
  padding: "11px 28px",
  borderBottom: `1px solid ${vars.rule}`,
  display: "flex",
  alignItems: "baseline",
  gap: space["5"],
  background: vars.glass.bgSoft,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  flexShrink: 0,
  "@media": {
    [media.mobile]: { display: "none" },
  },
});
