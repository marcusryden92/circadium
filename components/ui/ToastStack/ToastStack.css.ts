import { style, keyframes } from "@vanilla-extract/css";
import { vars, space, radii, zIndex } from "@/lib/theme";

// Absolute within the shell canvas (portaled there), sitting to the LEFT of
// the SaveIndicator's corner slot (15px offset + 30px circle + a gap),
// bottom-aligned with it.
export const stack = style({
  position: "absolute",
  bottom: 15,
  right: 55,
  zIndex: zIndex.toast,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: space["1.5"],
  pointerEvents: "none",
  maxWidth: "min(92vw, 480px)",
});

// One animation covers the whole lifetime: quick slide-in, hold, fade out at
// the tail. TOAST_DURATION_MS in ToastStack.tsx must match the duration here.
const toastLife = keyframes({
  "0%": { opacity: 0, transform: "translateY(8px)" },
  "5%": { opacity: 1, transform: "translateY(0)" },
  "88%": { opacity: 1 },
  "100%": { opacity: 0 },
});

export const toastItem = style({
  animation: `${toastLife} 4000ms ease forwards`,
  background: vars.ink,
  color: vars.paper,
  borderRadius: radii.md,
  padding: `${space["2"]}px ${space["3.5"]}px`,
  fontSize: 12.5,
  lineHeight: 1.45,
  boxShadow: vars.shadow.panelSm,
  textAlign: "center",
});
