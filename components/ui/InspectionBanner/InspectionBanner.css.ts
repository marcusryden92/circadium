import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex } from "@/lib/theme/scales";
import { text } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";

export const banner = style([
  text.bodySm,
  {
    position: "fixed",
    bottom: space["4"],
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: zIndex.toast,
    display: "flex",
    alignItems: "center",
    gap: space["3"],
    maxWidth: "min(92vw, 560px)",
    padding: "8px 10px 8px 16px",
    borderRadius: radii.pill,
    background: `color-mix(in srgb, ${vars.status.warning} ${colorMixAlpha.lightFill}%, ${vars.paper})`,
    border: `1px solid ${vars.status.warning}`,
    color: vars.ink,
    boxShadow: vars.shadow.panel,
  },
]);

export const label = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const exitButton = style([
  text.bodySm,
  {
    flexShrink: 0,
    padding: "5px 12px",
    borderRadius: radii.pill,
    border: "none",
    background: vars.ink,
    color: vars.paper,
    cursor: "pointer",
  },
]);
