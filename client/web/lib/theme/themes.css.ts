import { createTheme } from "@vanilla-extract/css";
import { vars } from "./tokens.css";
import { grayscale, paperSurface } from "./scales";

export const themeLight = createTheme(vars, {
  paper: "#f2efea",
  bezel: "#c8bfb6",
  ink: "#16142a",
  inkSoft: "#3c3a52",
  muted: "#7a7890",
  rule: "rgba(22,20,42,0.12)",
  textOnAccent: "#ffffff",
  overlay: "rgba(10,8,20,0.22)",
  tileFill: "#f2efea",

  surface: {
    canvas: paperSurface.canvas,
    sidebar: paperSurface.sidebar,
    content: paperSurface.content,
    modal: "rgba(255,255,255,0.80)",
  },

  glass: {
    bg: "rgba(255,255,255,0.28)",
    bgDeep: "rgba(255,255,255,0.65)",
    bgSoft: "rgba(255,255,255,0.16)",
    stroke: "rgba(22,20,42,0.14)",
    hi: "rgba(255,255,255,0.55)",
  },

  interactive: {
    hoverFill: "rgba(22,20,42,0.07)",
    selectedFill: "rgba(22,20,42,0.12)",
  },

  shadow: {
    panel:
      "0 14px 40px rgba(40,30,60,0.10), inset 0 1px 0 rgba(255,255,255,0.55)",
    panelSm:
      "0 6px 20px rgba(40,30,60,0.08), inset 0 1px 0 rgba(255,255,255,0.45)",
  },

  noise: {
    opacity: "0.18",
    blend: "overlay",
  },

  accent: {
    primary: "#3b82f6",
    now: "#6366f1",
    done: "#8b5cf6",
    secondary: "#6366f1",
  },

  status: {
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  },

  swatches: {
    blue: "#3b82f6",
    green: "#22c55e",
    violet: "#8b5cf6",
    indigo: "#6366f1",
    cyan: "#06b6d4",
    amber: "#f59e0b",
    rose: "#f43f5e",
    teal: "#14b8a6",
  },

  font: {
    display: "var(--app-font-display, 'Clash Display', sans-serif)",
    ui: "var(--app-font-ui, system-ui, sans-serif)",
  },
});

export const themeDark = createTheme(vars, {
  paper: "#12141a",
  bezel: "#06080b",
  ink: "#e6e8ec",
  inkSoft: "rgba(230,232,236,0.65)",
  muted: "rgba(230,232,236,0.42)",
  rule: "rgba(230,232,236,0.10)",
  textOnAccent: "#ffffff",
  overlay: "rgba(0,0,0,0.55)",
  tileFill: "#1c1f27",

  surface: {
    canvas: grayscale[10],
    sidebar: grayscale[15],
    content: grayscale[20],
    // Matches light mode's modal opacity; the frosted blur carries the rest of
    // the separation from content.
    modal: `color-mix(in srgb, ${grayscale[30]} 80%, transparent)`,
  },

  glass: {
    bg: "rgba(230,232,236,0.05)",
    bgDeep: "rgba(230,232,236,0.09)",
    bgSoft: "rgba(230,232,236,0.025)",
    stroke: "rgba(230,232,236,0.16)",
    hi: "rgba(230,232,236,0.20)",
  },

  interactive: {
    hoverFill: "rgba(230,232,236,0.07)",
    selectedFill: "rgba(230,232,236,0.12)",
  },

  shadow: {
    panel: "0 14px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(230,232,236,0.14)",
    panelSm:
      "0 6px 20px rgba(0,0,0,0.40), inset 0 1px 0 rgba(230,232,236,0.12)",
  },

  noise: {
    opacity: "0.22",
    blend: "soft-light",
  },

  accent: {
    primary: "#60a5fa",
    now: "#818cf8",
    done: "#a78bfa",
    secondary: "#818cf8",
  },

  status: {
    success: "#34d399",
    warning: "#fbbf24",
    error: "#f87171",
    info: "#60a5fa",
  },

  swatches: {
    blue: "#60a5fa",
    green: "#34d399",
    violet: "#a78bfa",
    indigo: "#818cf8",
    cyan: "#22d3ee",
    amber: "#fbbf24",
    rose: "#fb7185",
    teal: "#2dd4bf",
  },

  font: {
    display: "var(--app-font-display, 'Clash Display', sans-serif)",
    ui: "var(--app-font-ui, system-ui, sans-serif)",
  },
});
