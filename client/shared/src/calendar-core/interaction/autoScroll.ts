/**
 * Auto-scroll speed curve: returns a scroll speed (px/frame) based on the
 * pointer's distance to the nearest edge of the scroll container's viewport.
 *
 * The renderer calls this during a drag and applies the returned speed to its
 * scroll container. The core never scrolls anything itself.
 *
 * Modeled on FullCalendar's AutoScroller (interaction/index.js): the speed
 * ramps linearly from 0 at the edge zone boundary to `maxSpeed` at the
 * container edge. Outside the edge zone the speed is 0 (no scrolling).
 */

const DEFAULT_EDGE_ZONE = 50;
const DEFAULT_MAX_SPEED = 25;

/**
 * @param pointerY          - pointer y relative to the scroll container's
 *                            visible area (0 = top edge, viewportHeight = bottom)
 * @param viewportHeight    - visible height of the scroll container
 * @param edgeZone          - distance from the edge where scrolling starts (px)
 * @param maxSpeed          - maximum scroll speed (px/frame)
 * @returns positive = scroll down, negative = scroll up, 0 = no scroll
 */
export function autoScrollSpeed(
  pointerY: number,
  viewportHeight: number,
  edgeZone = DEFAULT_EDGE_ZONE,
  maxSpeed = DEFAULT_MAX_SPEED,
): number {
  if (viewportHeight <= 0) return 0;

  const distanceFromTop = pointerY;
  const distanceFromBottom = viewportHeight - pointerY;

  if (distanceFromTop < edgeZone && distanceFromTop >= 0) {
    const ratio = 1 - distanceFromTop / edgeZone;
    return -maxSpeed * ratio;
  }

  if (distanceFromBottom < edgeZone && distanceFromBottom >= 0) {
    const ratio = 1 - distanceFromBottom / edgeZone;
    return maxSpeed * ratio;
  }

  return 0;
}
