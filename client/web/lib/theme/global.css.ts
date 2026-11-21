import { globalStyle } from "@vanilla-extract/css";
import { vars } from "./tokens.css";
import { themeLight, themeDark } from "./themes.css";
import { backdropFilters, colorMixAlpha } from "./effects";
import { radii } from "./scales";

globalStyle("*, *::before, *::after", {
  boxSizing: "border-box",
});

// Tell the browser which palette to render native UI in (the caret, native
// select/date/time pickers, spin buttons, autofill). Without this, native
// controls paint light OS chrome on a dark theme and read as "not following
// the theme." Set on the theme roots (applied to <body>) so every native
// control inherits it — individual per-input colorScheme patches are no
// longer needed.
globalStyle(`.${themeLight}`, {
  colorScheme: "light",
});

globalStyle(`.${themeDark}`, {
  colorScheme: "dark",
});

globalStyle("html", {
  scrollbarWidth: "thin",
  scrollbarColor: `${vars.glass.bgDeep} transparent`,
});

globalStyle("::-webkit-scrollbar", {
  width: 7,
  height: 7,
});

globalStyle("::-webkit-scrollbar-track", {
  background: "transparent",
});

globalStyle("::-webkit-scrollbar-thumb", {
  background: vars.glass.bgDeep,
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii.pill,
  backgroundClip: "padding-box",
  boxShadow: `inset 0 1px 0 ${vars.glass.hi}`,
  backdropFilter: backdropFilters.scrollbar,
  WebkitBackdropFilter: backdropFilters.scrollbar,
});

globalStyle("::-webkit-scrollbar-thumb:hover", {
  background: `color-mix(in srgb, ${vars.ink} ${colorMixAlpha.selectedFill}%, transparent)`,
  backgroundClip: "padding-box",
});

globalStyle("::-webkit-scrollbar-corner", {
  background: "transparent",
});

// Invisible spacer buttons at the ends of every scrollbar track. WebKit hides
// scrollbar buttons by default; giving them a height with display:block turns
// them into transparent end caps that push the thumb inward, so the scrollbar
// thumb never abuts the edges of its container. Firefox ignores these
// pseudo-elements, so its scrollbars stay edge-to-edge.
globalStyle("::-webkit-scrollbar-button:vertical:start:decrement", {
  display: "block",
  height: 16,
  background: "transparent",
});

globalStyle("::-webkit-scrollbar-button:vertical:end:increment", {
  display: "block",
  height: 16,
  background: "transparent",
});

globalStyle("::-webkit-scrollbar-button:horizontal:start:decrement", {
  display: "block",
  width: 16,
  background: "transparent",
});

globalStyle("::-webkit-scrollbar-button:horizontal:end:increment", {
  display: "block",
  width: 16,
  background: "transparent",
});

// Suppress the inverse buttons (start:increment / end:decrement) that some
// WebKit builds render as doubled arrows; we only want one spacer per end.
globalStyle(
  "::-webkit-scrollbar-button:vertical:start:increment, ::-webkit-scrollbar-button:vertical:end:decrement, ::-webkit-scrollbar-button:horizontal:start:increment, ::-webkit-scrollbar-button:horizontal:end:decrement",
  {
    display: "none",
  },
);
