import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { DURATIONS } from "@/lib/theme/transitions";

export const segmentedControl = style({
  position: "relative",
  display: "inline-grid",
  padding: space["1"],
  borderRadius: radii.pill,
  background: vars.glass.bgSoft,
  border: `1px solid ${vars.glass.stroke}`,
});

export const segmentedThumb = style({
  position: "absolute",
  top: space["1"],
  bottom: space["1"],
  left: 0,
  borderRadius: radii.pill,
  background: vars.ink,
  transition: `transform ${DURATIONS.collapse}s cubic-bezier(0.4, 0, 0.2, 1), width ${DURATIONS.collapse}s cubic-bezier(0.4, 0, 0.2, 1)`,
  zIndex: 0,
});

export const segmentedButton = style({
  position: "relative",
  zIndex: 1,
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: "4px 12px",
  borderRadius: radii.pill,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space["1.5"],
  fontSize: 11,
  fontFamily: vars.font.ui,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: vars.muted,
  transition: `color ${DURATIONS.collapse}s cubic-bezier(0.4, 0, 0.2, 1)`,
  selectors: {
    "&[data-active='true']": { color: vars.paper },
    "&:hover:not([data-active='true'])": { color: vars.ink },
  },
});
