export {
  fallbackCalendarColor,
  isHexColor,
} from "@circadium/shared/domain/calendarColors";

// Threshold against perceivedBrightness — below this the fill reads as dark
// and wants a lighter stroke; above, the fill reads as light and wants a
// darker stroke. 140 is the YIQ midpoint that sorts saturated mid-tones
// (yellow/cyan as "light", red/blue/purple as "dark") the way they read in
// practice.
const TEMPLATE_BORDER_BRIGHTNESS_PIVOT = 140;

// OKLCH lightness deltas applied when shifting the border up or down from the
// fill. Two values because human perception is asymmetric — light strokes on
// saturated fills read as softer than dark strokes of equal numeric shift,
// so lighten gets a bigger number to compensate.
const TEMPLATE_BORDER_LIGHTEN = 0.3;
const TEMPLATE_BORDER_DARKEN = 0.3;

// YIQ luminance — perceived brightness from 0 to 255. Used to pick text color
// contrast against a colored background, and to choose lighten vs. darken
// when computing a derived stroke.
export function perceivedBrightness(hex: string | undefined | null): number {
  if (!hex) return 0;
  let s = hex.trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (s.length === 3)
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  if (s.length !== 6) return 0;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Compute the template-event dashed border color: same hue/chroma as the
// fill, lightness shifted up or down depending on which direction has more
// contrast headroom. Uses OKLCH relative-color syntax so the shift is
// perceptually uniform.
export function computeTemplateBorder(tint: string): string {
  const goLighter = perceivedBrightness(tint) < TEMPLATE_BORDER_BRIGHTNESS_PIVOT;
  const lDelta = goLighter ? TEMPLATE_BORDER_LIGHTEN : -TEMPLATE_BORDER_DARKEN;
  const sign = lDelta >= 0 ? "+" : "-";
  return `oklch(from ${tint} calc(l ${sign} ${Math.abs(lDelta)}) c h)`;
}
