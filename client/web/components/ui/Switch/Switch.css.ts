import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii } from "@/lib/theme/scales";
import { interactive2Transition } from "@/lib/theme/transitions";

export const root = style({
  position: "relative",
  width: 32,
  height: 18,
  borderRadius: radii.pill,
  // The off track sat on glass.bgSoft, which vanished against opaque surfaces
  // (onboarding, cards). A 20% ink-over-paper mix reads as a clear gray track
  // on both themes (ink/paper invert together) while the checked ink track
  // still stands apart.
  border: `1px solid ${vars.rule}`,
  background: `color-mix(in srgb, ${vars.ink} 20%, ${vars.paper})`,
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
  transition: interactive2Transition("background", "border-color"),
  selectors: {
    '&[data-state="checked"]': {
      background: vars.ink,
      borderColor: vars.ink,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.accent.primary}`,
      outlineOffset: 2,
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
});

export const thumb = style({
  display: "block",
  width: 14,
  height: 14,
  borderRadius: radii.pill,
  background: vars.paper,
  // A small drop shadow lifts the paper thumb off both the gray off-track and
  // the ink checked-track so the control always reads.
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.28)",
  transform: "translateX(1px)",
  transition: interactive2Transition("transform"),
  willChange: "transform",
  selectors: {
    '&[data-state="checked"]': {
      transform: "translateX(15px)",
    },
  },
});
