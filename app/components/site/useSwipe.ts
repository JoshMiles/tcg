import { useRef, type TouchEvent } from 'react';

/** True when the touch began on something that handles its own input or scrolls sideways. */
function ownsTouch(el: Element | null, root: Element): boolean {
  for (; el && el !== root; el = el.parentElement) {
    if (el.matches('input, textarea, select, button, a, summary, [role="slider"]')) return true;
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/** Touch-only horizontal swipe: calls `onSwipe(1)` for a swipe left (next) and `onSwipe(-1)` for right (previous).
 *  Acts only when sideways movement clearly dominates, so vertical scroll and drag-to-close are left alone. */
export function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0];
      start.current = e.touches.length === 1 && !ownsTouch(e.target as Element, e.currentTarget) ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => { start.current = null; },
  };
}
