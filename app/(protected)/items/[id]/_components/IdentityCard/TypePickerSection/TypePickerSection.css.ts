import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";

export const typePicker = style({
  position: "relative",
  display: "inline-grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  padding: space["1"],
  borderRadius: radii.pill,
  background: vars.glass.bgSoft,
  border: `1px solid ${vars.glass.stroke}`,
  alignSelf: "flex-start",
});

export const typePickerThumb = style({
  position: "absolute",
  top: 3,
  bottom: 3,
  left: 3,
  width: "calc(33.333% - 2px)",
  borderRadius: radii.pill,
  background: vars.ink,
  transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
  zIndex: 0,
  selectors: {
    "&[data-position='1']": { transform: "translateX(100%)" },
    "&[data-position='2']": { transform: "translateX(200%)" },
  },
});

export const typePickerBtn = style({
  position: "relative",
  zIndex: 1,
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: "4px 12px",
  borderRadius: radii.pill,
  cursor: "pointer",
  fontSize: 11,
  fontFamily: vars.font.ui,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: vars.muted,
  transition: "color 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: {
    "&[data-active='true']": { color: vars.paper },
    "&:hover:not([data-active='true'])": { color: vars.ink },
  },
});
