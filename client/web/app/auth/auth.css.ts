import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { media } from "@/lib/theme/scales";

// Locked to light. Split layout: vector field on the left, paper form panel
// on the right. Carries the landing's hero artifact through the transition.
export const page = style({
  position: "relative",
  minHeight: "100vh",
  width: "100%",
  display: "flex",
  background: vars.paper,
  color: vars.ink,
  "@media": {
    [media.mobile]: { flexDirection: "column" },
  },
});

// Left side â€” vector field with a Circadium wordmark overlay (mirrors the
// landing hero so the page transition feels continuous).
export const fieldPanel = style({
  position: "relative",
  flex: "0 0 45%",
  overflow: "hidden",
  isolation: "isolate",
  "@media": {
    [media.mobile]: {
      flex: "0 0 auto",
      height: 200,
      width: "100%",
    },
  },
});

// Positions the brand lockup at the field's bottom-left. Pointer-events: none
// so it doesn't block the canvas's mouse interaction.
export const fieldBrand = style({
  position: "absolute",
  left: "clamp(20px, 3vw, 48px)",
  bottom: "clamp(20px, 3vw, 48px)",
  pointerEvents: "none",
  userSelect: "none",
  zIndex: 1,
  "@media": {
    [media.mobile]: {
      left: 20,
      bottom: 16,
    },
  },
});

// Right side â€” paper form panel.
export const formPanel = style({
  flex: "1 1 0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(24px, 5vw, 56px)",
  position: "relative",
  "@media": {
    [media.mobile]: {
      padding: "32px 20px 48px",
    },
  },
});

// Back-to-landing link in the top corner of the form panel.
export const backLink = style({
  position: "absolute",
  top: "clamp(16px, 2vw, 24px)",
  right: "clamp(16px, 2vw, 24px)",
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  color: vars.muted,
  textDecoration: "none",
  letterSpacing: "0.02em",
  selectors: {
    "&:hover": { color: vars.ink },
  },
});
