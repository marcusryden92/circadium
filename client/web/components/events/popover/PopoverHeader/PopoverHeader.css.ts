import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { interactiveTransition } from "@/lib/theme/transitions";

export const header = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "10px 12px",
  borderBottom: `1px solid ${vars.rule}`,
  // Single source of the drag-grabbing cursor state, driven by data-dragging.
  selectors: {
    '&[data-dragging="true"]': { cursor: "grabbing" },
  },
});

export const dragHandle = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 26,
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.muted,
  cursor: "grab",
  borderRadius: radii.xs,
  transition: interactiveTransition("color"),
  selectors: {
    "&:hover": { color: vars.ink },
    "&:active": { cursor: "grabbing" },
  },
  "@media": {
    [media.mobile]: { display: "none" },
  },
});

export const headerBadges = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flex: 1,
  minWidth: 0,
  flexWrap: "wrap",
});

export const closeBtn = iconBtn({ size: "sm" });
