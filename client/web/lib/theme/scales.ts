// Theme-independent numeric scales. These do not change between light/dark,
// so they live outside the vars contract as plain constants. Both sprinkles
// (for atomic props) and style() blocks import from here — this is the single
// source of truth for space, radius, breakpoint, border-width, z-index, and
// content-width vocabulary across the app.

export const space = {
  none: 0,
  px: 1,
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "3.5": 14,
  "4": 16,
  "4.5": 18,
  "5": 20,
  "6": 24,
  "7": 28,
  "8": 32,
  "10": 40,
  "12": 48,
  "14": 56,
  "16": 64,
  "20": 80,
  "21": 88,
  "22": 96,
  "23": 104,
} as const;

// Radius scale — the base tiers (xs/sm/md/lg/xl/2xl/3xl) are the "snap-to"
// palette for chips, buttons, cards, and panels. The `+2` half-steps
// (10, 14, 18, 22) exist because the shared recipes (glass, popover)
// intentionally sit a couple pixels rounder than a plain card at the same
// "size" tier — that softness is part of the frosted-panel identity. Prefer
// the base tiers for new leaf components; reach for the half-steps only
// inside recipe variants that need to differentiate a floating surface from
// a static one.
export const radii = {
  none: 0,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  // Half-steps for glass/popover surface differentiation.
  "sm+2": 10,
  "md+2": 14,
  "lg+2": 18,
  "xl+2": 22,
  pill: 999,
} as const;

// Cool-gray ramp: hue 225, 10% saturation, one stop every 5% of lightness
// (0-100), keyed by lightness percentage. Theme-independent — the dark-mode
// shell surfaces pick the dark end.
export const grayscale = Object.fromEntries(
  Array.from({ length: 21 }, (_, i) => [i * 5, `hsl(225, 10%, ${i * 5}%)`])
) as Record<number, string>;

// Warm off-white paper surfaces for the light-mode shell (original paper hue).
export const paperSurface = {
  canvas: "hsl(37, 20%, 90%)",
  sidebar: "hsl(37, 20%, 93%)",
  content: "hsl(37, 20%, 96%)",
} as const;

// Content-width scale for layouts and text measures.
//   xs   — feature/CTA copy
//   sm   — comfortable reading measure
//   md   — display heading measure
//   lg   — hero headline
//   xl   — page-level content container (item detail)
//   2xl  — widest layout (landing wide grid)
export const contentWidth = {
  xs: 520,
  sm: 640,
  md: 820,
  lg: 960,
  xl: 1240,
  "2xl": 1280,
} as const;

// Breakpoint values (in pixels). Layouts are mobile-first; each breakpoint is
// the *maximum* width at which the smaller layout still applies. So
// `mobile: 767` means "mobile up to 767px" and tablet/desktop start at 768.
// `laptop: 1279` marks the boundary below which a persistent side column
// (sidebar + 340px engine console + a usable week grid) no longer fits;
// surfaces that dock a wide side panel switch it to an overlay under this.
export const breakpoints = {
  mobile: 767,
  tablet: 1023,
  laptop: 1279,
} as const;

// 599 is the phone/tablet divider on the device's SMALLER dimension
// (Android's 600dp convention): width in portrait, height in landscape.
const phoneDivider = 599;
const touchDevice = "(hover: none) and (pointer: coarse)";

// A phone held sideways is ~800–930px wide — squarely in the tablet width
// band — so pure width queries misread it as a desktop viewport. It is a
// touch device whose height (the smaller dimension in landscape) is at or
// under the phone divider.
const landscapePhone = `screen and ${touchDevice} and (orientation: landscape) and (max-height: ${phoneDivider}px)`;

// The height-flip of landscapePhone: a touch device in landscape whose short
// side (height) clears the phone divider, i.e. a tablet-class device held
// sideways. Real tablets in landscape are ~1024-1366px wide, so a width query
// misreads them as desktop; this keys on the short dimension instead.
const landscapeTablet = `screen and ${touchDevice} and (orientation: landscape) and (min-height: ${phoneDivider + 1}px)`;

// The *Up queries must exclude a landscape phone. The exclusion is written
// as a query list negating one landscapePhone feature per clause (rather
// than a media-level `not`) so every clause parses on pre-MQ4 engines and
// a failed clause degrades alone instead of killing the whole query.
const notLandscapePhoneClauses = [
  "(hover: hover)",
  "(pointer: fine)",
  "(orientation: portrait)",
  `(min-height: ${phoneDivider + 1}px)`,
];
const minWidthUnlessLandscapePhone = (px: number) =>
  notLandscapePhoneClauses
    .map((clause) => `screen and (min-width: ${px}px) and ${clause}`)
    .join(", ");

// Prebuilt media query strings. Use inside `@media` keys in vanilla-extract
// style() blocks: `"@media": { [media.mobile]: { ... } }`.
// `mobile` means "narrow viewport OR landscape phone" — the phone UI follows
// the device through rotation instead of flipping to desktop; the *Up
// queries exclude the landscape phone symmetrically. `tablet`/`laptop`
// carry the same OR clause only so the mobile ⊂ tablet ⊂ laptop containment
// holds by construction. `touch` keys on pointer capability alone — it
// drives the interaction model (gestures, sheets, hit targets) on all touch
// devices, tablets included. `landscapePhone` is for
// the rare mobile style whose portrait treatment assumes a TALL viewport
// (e.g. a fixed-height canvas block) — key the correction on it AFTER the
// mobile block; within one style object, later `@media` keys win.
export const media = {
  mobile: `screen and (max-width: ${breakpoints.mobile}px), ${landscapePhone}`,
  tablet: `screen and (max-width: ${breakpoints.tablet}px), ${landscapePhone}`,
  laptop: `screen and (max-width: ${breakpoints.laptop}px), ${landscapePhone}`,
  tabletUp: minWidthUnlessLandscapePhone(breakpoints.mobile + 1),
  desktopUp: minWidthUnlessLandscapePhone(breakpoints.tablet + 1),
  wideUp: minWidthUnlessLandscapePhone(breakpoints.laptop + 1),
  touch: `screen and ${touchDevice}`,
  landscapePhone,
  landscapeTablet,
} as const;

// Border-width scale. `hairline` is the app's default 1px rule (85+ uses);
// `medium` is used for accent underlines and focus rings; `thick` is for
// the editable-title border and heavier emphasis marks.
export const borderWidth = {
  none: 0,
  hairline: 1,
  medium: 2,
  thick: 3,
} as const;

// Semantic z-index layers. Each named tier reserves a numeric band; local
// stacking within a layer uses ordinary CSS stacking (no z-index needed).
// Ordering rationale:
//   base     — default flow, backdrops
//   docked   — mobile tabs, sticky headers within scroll containers
//   raised   — small overlays inside a card
//   floating — FloatingUI-style popovers anchored to content
//   palette  — shell-level palettes (search, capture)
//   popoverOverPalette — pickers spawned from within a palette
//   modal    — dialogs / confirm modals (block palettes and popovers)
//   modalOver — modals spawned from within a modal (e.g. edit-location
//               opened from another dialog)
//   toast    — future toast surface (top of everything)
export const zIndex = {
  base: 0,
  docked: 5,
  raised: 10,
  floating: 30,
  palette: 50,
  popoverOverPalette: 60,
  modal: 100,
  modalOver: 150,
  toast: 200,
  // First-run data-load overlay; sits above every other layer.
  appLoading: 300,
} as const;

export type Space = typeof space;
export type Radii = typeof radii;
export type ContentWidth = typeof contentWidth;
export type Breakpoints = typeof breakpoints;
export type Media = typeof media;
export type BorderWidth = typeof borderWidth;
export type ZIndex = typeof zIndex;
