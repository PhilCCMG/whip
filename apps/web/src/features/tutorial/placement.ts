/**
 * Where Bramley's card docks: beside its target in free space. It never covers the target, any
 * element marked `data-tutorial-avoid` (MEET, BUILD RELATIONSHIP, END WEEK…), the HUD or the
 * footer. Phones dock a compact card bottom-left (or top-left when that is in the way). Pure, so
 * it is unit-testable.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MOBILE_BREAKPOINT = 768;
const GAP = 14;
const EDGE = 16;
/** Below the HUD strip (and, on desktop, the place tabs under it). */
const MOBILE_TOP = 64;
const DESKTOP_TOP = 112;
/** The footer: END WEEK (raised to 72px) on desktop; END WEEK bar + place tabs on phones. */
const footer = (vw: number) => (vw >= MOBILE_BREAKPOINT ? 72 : 112);
/** Free-space search grid. */
const STEP = 16;

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;
export const intersects = (a: Rect, b: Rect) =>
  a.left < right(b) && right(a) > b.left && a.top < bottom(b) && bottom(a) > b.top;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function placeCard(
  target: Rect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  avoid: readonly Rect[] = [],
): { left: number; top: number } {
  const { width: vw, height: vh } = viewport;
  const w = Math.min(card.width, vw - EDGE * 2);
  const h = card.height;
  const top0 = vw >= MOBILE_BREAKPOINT ? DESKTOP_TOP : MOBILE_TOP;
  const maxBottom = vh - footer(vw) - 12;
  const blocked = target ? [target, ...avoid] : [...avoid];
  const at = (p: { left: number; top: number }): Rect => ({ ...p, width: w, height: h });
  const free = (p: { left: number; top: number }) =>
    p.top >= top0 &&
    p.top + h <= maxBottom &&
    p.left >= EDGE &&
    p.left + w <= vw - EDGE &&
    !blocked.some((b) => intersects(at(p), b));

  const dockBottom = { left: EDGE, top: Math.max(top0, maxBottom - h) };
  const dockTop = { left: EDGE, top: top0 };

  if (vw < MOBILE_BREAKPOINT) {
    if (free(dockBottom)) return dockBottom;
    if (free(dockTop)) return dockTop;
    return nearestFree(free, target, w, h, top0, maxBottom, vw) ?? dockBottom;
  }

  if (!target)
    return free(dockBottom)
      ? dockBottom
      : (nearestFree(free, null, w, h, top0, maxBottom, vw) ?? dockBottom);

  // Beside the target first, in reading-friendly order.
  const x = clamp(target.left, EDGE, vw - w - EDGE);
  const y = clamp(target.top, top0, maxBottom - h);
  const beside = [
    { left: x, top: bottom(target) + GAP }, // below
    { left: right(target) + GAP, top: y }, // right gutter
    { left: target.left - GAP - w, top: y }, // left
    { left: x, top: target.top - GAP - h }, // above
  ];
  return (
    beside.find(free) ??
    nearestFree(free, target, w, h, top0, maxBottom, vw) ??
    (free(dockBottom) ? dockBottom : dockTop)
  );
}

/** The free spot closest to the target (or to the bottom-left dock), on a coarse grid. */
function nearestFree(
  free: (p: { left: number; top: number }) => boolean,
  target: Rect | null,
  w: number,
  h: number,
  top0: number,
  maxBottom: number,
  vw: number,
): { left: number; top: number } | null {
  const cx = target ? target.left + target.width / 2 : EDGE;
  const cy = target ? target.top + target.height / 2 : maxBottom;
  let best: { left: number; top: number } | null = null;
  let bestD = Infinity;
  for (let top = top0; top + h <= maxBottom; top += STEP) {
    for (let left = EDGE; left + w <= vw - EDGE; left += STEP) {
      const p = { left, top };
      if (!free(p)) continue;
      const d = Math.hypot(left + w / 2 - cx, top + h / 2 - cy);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
