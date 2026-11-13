// Named backdrop-filter presets. Single source of truth for the frosted-glass
// blur+saturation pairs the rest of the app sets via inline strings.
//
// `WebkitBackdropFilter` should be set alongside `backdropFilter` to the same
// value — Safari ships the unprefixed property only behind a flag.
export const backdropFilters = {
  panel: "blur(28px) saturate(180%)",
  button: "blur(12px) saturate(140%)",
  event: "blur(12px) saturate(160%)",
  scrollbar: "blur(14px) saturate(160%)",
  palette: "blur(8px)",
  modal: "blur(4px)",
  confirm: "blur(2px)",
} as const;

export type BackdropFilterKey = keyof typeof backdropFilters;

// Named opacity percentages for `color-mix(in srgb, X N%, transparent)` calls.
// Names describe the visual role, not the numeric value, so tweaking a
// hierarchy step shifts every consumer at once. Only the recurring semantic
// stops are named; one-off bespoke percentages (e.g. specific text-on-tint
// contrast picks) stay as literals at their call site.
export const colorMixAlpha = {
  subtleFill: 10, // soft category fills, alt-row hovers
  lightFill: 14, // badge backgrounds, gentle category tints, status accents
  hoverFill: 22, // drag/hover scrims, focused-emphasis fills
  selectedFill: 28, // selected/focused tile fills
  alertFill: 78, // travel-alert color saturation
  denseFill: 94, // event tile fills (near-opaque)
} as const;

export type ColorMixAlphaKey = keyof typeof colorMixAlpha;
