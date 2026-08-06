import { style, keyframes } from "@vanilla-extract/css";
import { vars, radii, zIndex } from "@/lib/theme";

// Quick fade-in, brief hold, fade-out. SAVE_FLASH_MS in SaveIndicator.tsx
// must match the duration here.
const saveFlash = keyframes({
  "0%": { opacity: 0, transform: "scale(0.85)" },
  "12%": { opacity: 1, transform: "scale(1)" },
  "70%": { opacity: 1 },
  "100%": { opacity: 0 },
});

// Absolute within the shell canvas (portaled there): 15px offsets + 30px
// circle echo the sidebar logo icon and user avatar, measured from the same
// canvas frame as the sidebar's own 15px padding.
export const circle = style({
  position: "absolute",
  bottom: 15,
  right: 15,
  width: 30,
  height: 30,
  borderRadius: radii.pill,
  background: vars.ink,
  color: vars.paper,
  display: "grid",
  placeItems: "center",
  boxShadow: vars.shadow.panelSm,
  zIndex: zIndex.toast,
  pointerEvents: "none",
  animation: `${saveFlash} 1600ms ease forwards`,
});
