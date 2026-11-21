// Single source of truth for transition durations (in seconds).
// Tweak any value here to retune that category of motion across the app.
export const DURATIONS = {
  // Light/dark color, border, shadow swaps.
  theme: 0.3,

  // Button hover/state changes (color shifts when entering/leaving hover).
  buttonState: 1,

  // :active press scale feedback on buttons.
  press: 0.12,

  // Quick hover/swap transitions inside popovers and pickers (transform,
  // box-shadow, color, opacity). Same numeric value as `press` but distinct
  // intent — tweak either independently.
  interactive: 0.12,

  // Slightly slower interactive transition for inputs/switches where the
  // ease feels better at ~140ms.
  interactive2: 0.14,

  // Sidebar collapse, label fade, panel slide-in animations.
  collapse: 0.22,

  // Modal/dialog/sheet entrance.
  modal: 0.18,

  // Progress bar width fills.
  progress: 0.25,
} as const;

// Theme-driven properties (the ones that swap when light/dark toggles).
const themeProperties = [
  "background-color",
  "color",
  "border-color",
  "box-shadow",
  "fill",
  "stroke",
];

// ---- Composed transition strings ----

// For elements whose only animated change is the theme (canvas, glass, badges).
export const themeTransition = themeProperties
  .map((p) => `${p} ${DURATIONS.theme}s ease`)
  .join(", ");

// For interactive buttons — press feedback + theme color swaps.
// (State changes use the same color properties as theme, so they share timing.)
export const buttonTransition = `transform ${DURATIONS.press}s ease, ${themeTransition}`;

// For sidebar + any collapsible row — width/max-width/opacity/padding/gap
// animate together with theme colors.
export const collapseTransition = [
  `width ${DURATIONS.collapse}s ease`,
  `max-width ${DURATIONS.collapse}s ease`,
  `opacity ${DURATIONS.collapse}s ease`,
  `padding ${DURATIONS.collapse}s ease`,
  `gap ${DURATIONS.collapse}s ease`,
  `transform ${DURATIONS.collapse}s ease`,
  themeTransition,
].join(", ");

// For progress bar width fills.
export const progressTransition = `width ${DURATIONS.progress}s ease`;

// Compose a multi-property transition string at DURATIONS.interactive (120ms).
// Used by popovers, pickers, tree rows, and most hover/swap interactions where
// a quick perceptual feedback is wanted without theme-level color easing.
export const interactiveTransition = (...properties: string[]) =>
  properties.map((p) => `${p} ${DURATIONS.interactive}s ease`).join(", ");

// Same shape at DURATIONS.interactive2 (140ms) — switches and a few inputs
// where the slightly slower ease feels better.
export const interactive2Transition = (...properties: string[]) =>
  properties.map((p) => `${p} ${DURATIONS.interactive2}s ease`).join(", ");

// Back-compat alias for the previously exported TRANSITION_SPEED.
export const TRANSITION_SPEED = DURATIONS.theme;
