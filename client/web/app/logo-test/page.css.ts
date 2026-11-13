import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { collapseTransition } from "@/lib/theme/transitions";

export const brand = style({
  padding: "0 0 5px",
  display: "flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
});

export const brandLogo = style({
  width: 150,
  height: 150,
  flexShrink: 0,
  backgroundColor: vars.paper,
  WebkitMaskImage: "url(/logo.svg)",
  maskImage: "url(/logo.svg)",
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
});

export const brandText = style({
  fontFamily: vars.font.display,
  fontSize: 100,
  fontWeight: 400,
  letterSpacing: "-0.03em",
  color: vars.paper,
  flex: 1,
  minWidth: 0,
  maxWidth: "100%",
  paddingLeft: space["3"],
  boxSizing: "border-box",
  overflow: "hidden",
  transition: collapseTransition,
  selectors: {
    '[data-collapsed="true"] &': {
      maxWidth: 0,
      opacity: 0,
    },
  },
});
