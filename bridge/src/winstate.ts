// Where the main window opens (ROADMAP 59.2): the size, place and maximised state from last time, if that spot is still on a screen. Pure, so check.ts can test it without Electron.
export interface Area { x: number; y: number; width: number; height: number }
/** What is remembered between runs: the normal (not maximised) bounds, and whether it was maximised. */
export interface WinState extends Area { maximized: boolean }
export const DEFAULT_SIZE = { width: 1280, height: 800 };
export const MIN_SIZE = { width: 960, height: 620 };
const TITLE_BAR = 40; // the strip that has to stay reachable, so the window can still be dragged
const MIN_GRAB = { width: 100, height: 24 }; // how much of the title bar must lie on a screen

const int = (v: unknown, lo: number, hi: number): number | null => (Number.isFinite(v) && (v as number) >= lo && (v as number) <= hi ? Math.round(v as number) : null);

export function cleanWinState(raw: unknown): WinState | null {
  const r = raw as Partial<WinState> | null | undefined;
  const x = int(r?.x, -50000, 50000), y = int(r?.y, -50000, 50000), width = int(r?.width, MIN_SIZE.width, 20000), height = int(r?.height, MIN_SIZE.height, 20000);
  return x === null || y === null || width === null || height === null ? null : { x, y, width, height, maximized: r?.maximized === true };
}

const overlap = (a: Area, b: Area): { width: number; height: number } => ({
  width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

/** Where to open: the saved spot if its title bar is on a screen (size clamped to that screen's work area), otherwise the default size centred on `primary`. */
export function placeWindow(saved: WinState | null, areas: Area[], primary: Area): WinState {
  if (saved) {
    const bar: Area = { x: saved.x, y: saved.y, width: saved.width, height: TITLE_BAR };
    let best: Area | null = null, bestArea = 0;
    for (const a of areas) {
      const o = overlap(bar, a);
      if (o.width >= MIN_GRAB.width && o.height >= MIN_GRAB.height && o.width * o.height > bestArea) { best = a; bestArea = o.width * o.height; }
    }
    if (best) {
      const width = Math.min(saved.width, best.width), height = Math.min(saved.height, best.height);
      return { x: Math.max(best.x, Math.min(saved.x, best.x + best.width - width)), y: Math.max(best.y, Math.min(saved.y, best.y + best.height - height)), width, height, maximized: saved.maximized };
    }
  }
  const width = Math.min(DEFAULT_SIZE.width, primary.width), height = Math.min(DEFAULT_SIZE.height, primary.height);
  return { x: primary.x + Math.round((primary.width - width) / 2), y: primary.y + Math.round((primary.height - height) / 2), width, height, maximized: false };
}
