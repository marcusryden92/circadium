import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, zIndex } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { DURATIONS } from "@/lib/theme/transitions";

const slideUp = keyframes({
  from: { opacity: 0, transform: "translate(-50%, 8px)" },
  to: { opacity: 1, transform: "translate(-50%, 0)" },
});

export const banner = style([
  popover({ size: "md" }),
  {
    position: "fixed",
    left: "50%",
    bottom: space["6"],
    transform: "translate(-50%, 0)",
    zIndex: zIndex.toast,
    maxWidth: "min(520px, calc(100vw - 32px))",
    padding: `${space["2.5"]} ${space["3.5"]}`,
    display: "flex",
    alignItems: "flex-start",
    gap: space["2"],
    fontFamily: vars.font.ui,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: vars.ink,
    animationName: slideUp,
    animationDuration: `${DURATIONS.modal}s`,
    animationTimingFunction: "ease",
  },
]);

export const icon = style({
  color: vars.status.error,
  flexShrink: 0,
  alignSelf: "center",
});
