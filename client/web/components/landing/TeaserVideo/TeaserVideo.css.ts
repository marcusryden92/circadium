import { style } from "@vanilla-extract/css";
import { vars, radii } from "@/lib/theme";

export const frame = style({
  position: "relative",
  borderRadius: radii["xl+2"],
  border: `1px solid ${vars.rule}`,
  overflow: "hidden",
  boxShadow: vars.shadow.panel,
  background: "#0b0e14",
});

export const video = style({
  display: "block",
  width: "100%",
  height: "auto",
  aspectRatio: "16 / 9",
});

export const playLayer = style({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  border: 0,
  padding: 0,
  cursor: "pointer",
  background: "rgba(10, 13, 20, 0.28)",
  transition: "background 0.3s ease",
  selectors: {
    "&:hover": { background: "rgba(10, 13, 20, 0.16)" },
  },
});

export const playButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 68,
  height: 68,
  borderRadius: "50%",
  background: "rgba(242, 239, 234, 0.94)",
  color: "#12161f",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
  transition: "transform 0.3s ease",
  selectors: {
    [`${playLayer}:hover &`]: { transform: "scale(1.06)" },
  },
});

export const playLabel = style({
  fontFamily: vars.font.ui,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.02em",
  color: "rgba(242, 239, 234, 0.92)",
  textShadow: "0 1px 8px rgba(0, 0, 0, 0.5)",
});
