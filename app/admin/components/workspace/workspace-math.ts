// Pure maths for the workspace shell: the resizable right column and drag-to-scrub number labels. No React, no overlay imports.

export const COLUMN_MIN = 20; // rem
export const COLUMN_MAX = 36;
export const COLUMN_DEFAULT = 26;
export const COLUMN_STEP = 1;

export const clampColumn = (rem: number) => (Number.isFinite(rem) ? Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(rem * 100) / 100)) : COLUMN_DEFAULT);

/** The value after dragging `dx` px on a label: one step per 4 px, x10 with Shift, clamped to min / max and rounded to the step's decimals. */
export function scrubValue(start: number, dx: number, step: number, shift: boolean, min = -Infinity, max = Infinity) {
  const raw = start + Math.round(dx / 4) * step * (shift ? 10 : 1);
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Math.min(max, Math.max(min, Number(raw.toFixed(decimals))));
}
