import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { themeTransition } from "@/lib/theme/transitions";

export const wrap = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.rule}`,
  borderRadius: radii["md+2"],
  background: vars.glass.bgSoft,
  padding: space["2.5"],
  cursor: "pointer",
  transition: themeTransition,
  selectors: {
    "&:hover": {
      background: vars.glass.bg,
      borderColor: vars.glass.stroke,
    },
  },
});

export const dayHeader = style({
  display: "grid",
  gridTemplateColumns: "36px repeat(7, 1fr)",
  gap: 0,
  marginBottom: space["1"],
});

export const dayLabel = style({
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: vars.muted,
  textAlign: "center",
  transition: themeTransition,
});

export const scrollArea = style({
  height: 240,
  overflowY: "auto",
  borderRadius: radii.sm,
  // Soft fade at the top/bottom so scrolled content visually attaches to the
  // header without a hard edge.
  maskImage:
    "linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)",
});

export const gridArea = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "36px repeat(7, 1fr)",
});

export const hourLabel = style({
  fontFamily: vars.font.ui,
  fontSize: 9,
  fontWeight: 500,
  color: vars.muted,
  fontVariantNumeric: "tabular-nums",
  paddingRight: space["1.5"],
  paddingTop: space["px"],
  textAlign: "right",
  transition: themeTransition,
});

export const dayCol = style({
  position: "relative",
  borderLeft: `1px solid ${vars.rule}`,
  transition: themeTransition,
  selectors: {
    "&:last-child": {
      borderRight: `1px solid ${vars.rule}`,
    },
  },
});

export const hourRow = style({
  borderTop: `1px dashed ${vars.rule}`,
  transition: themeTransition,
});

export const windowBlock = style({
  position: "absolute",
  left: 1,
  right: 1,
  borderRadius: 3,
  fontFamily: vars.font.ui,
  fontSize: 9,
  fontWeight: 600,
  color: vars.textOnAccent,
  padding: "2px 4px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
  overflow: "hidden",
  pointerEvents: "none",
});

export const emptyState = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "28px 12px",
  fontFamily: vars.font.ui,
  fontSize: 12.5,
  color: vars.muted,
  textAlign: "center",
  transition: themeTransition,
});

export const editHint = style({
  position: "absolute",
  bottom: 8,
  right: 10,
  fontFamily: vars.font.ui,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: vars.muted,
  background: vars.paper,
  padding: "2px 7px",
  borderRadius: radii.pill,
  border: `1px solid ${vars.rule}`,
  transition: themeTransition,
  pointerEvents: "none",
});
