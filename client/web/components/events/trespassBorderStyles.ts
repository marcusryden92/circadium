/**
 * Shared styling for the red "trespass" indicator surfaces that flag
 * location conflicts on calendar events and category wrappers.
 *
 * Visual rules — the same gradient is used for the thin side strips AND
 * the event/wrapper background:
 *   - Top trespass:    red at the top (0%), smoothly fading to the base
 *                      color by 50%, then base color the rest of the way.
 *   - Bottom trespass: base color from the top through 50%, smoothly
 *                      transitioning to red at the bottom (100%).
 *   - Both:            red at top (0%), base at 50%, red at bottom (100%) —
 *                      so the middle of the event stays readable.
 */

import { vars } from "@/lib/theme";

export const TRESPASS_BORDER_COLOR = vars.status.error;
/**
 * Same red at ~0.5 alpha to soften the trespass background tint. Uses
 * `color-mix` so the channel comes from the theme `status.error` token.
 */
export const TRESPASS_BACKGROUND_COLOR = `color-mix(in srgb, ${vars.status.error} 50%, transparent)`;
export const TRESPASS_BORDER_WIDTH = 1;

export function getTrespassGradient(
  trespassingStart: boolean,
  trespassingEnd: boolean,
  baseColor: string,
  redColor: string = TRESPASS_BORDER_COLOR,
): string {
  if (trespassingStart && trespassingEnd)
    return `linear-gradient(to bottom, ${redColor} 0%, ${baseColor} 50%, ${redColor} 100%)`;
  if (trespassingStart)
    return `linear-gradient(to bottom, ${redColor} 0%, ${baseColor} 50%)`;
  if (trespassingEnd)
    return `linear-gradient(to bottom, ${baseColor} 50%, ${redColor} 100%)`;
  return baseColor;
}
