// Arrow-key movement for a menu (pure). Used by the account dropdown so it behaves like a real menu.

/** Where focus goes next. Arrows wrap around; Home / End jump to the ends. Returns null for keys a menu doesn't handle. */
export function nextMenuIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown': return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp': return current <= 0 ? count - 1 : current - 1;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
