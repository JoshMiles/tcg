// Layout for the shareable card images (pure, client-safe). The drawing itself is in app/components/ShareImage.tsx; keeping the
// arithmetic here means it can be checked without a browser.

export const SHARE_W = 1080;
export const SHARE_H = 1350;
export const CARD_RATIO = 2 / 3; // width / height of the art

export interface Rect { x: number; y: number; w: number; h: number }

/** Where `n` cards go in the area under the header. One card is big and centred; more fill a grid, 3 per row (2 when there are 4). */
export function layoutCards(n: number, area: Rect, gap = 28): Rect[] {
  const count = Math.max(0, Math.min(9, Math.floor(n)));
  if (count === 0) return [];
  const cols = count === 1 ? 1 : count === 2 ? 2 : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  // The biggest card that fits both ways.
  const wByWidth = (area.w - gap * (cols - 1)) / cols;
  const hByHeight = (area.h - gap * (rows - 1)) / rows;
  const w = Math.min(wByWidth, hByHeight * CARD_RATIO);
  const h = w / CARD_RATIO;
  const out: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols; // centre a short last row
    const c = i - r * cols;
    const rowW = inRow * w + (inRow - 1) * gap;
    out.push({ x: area.x + (area.w - rowW) / 2 + c * (w + gap), y: area.y + (area.h - (rows * h + (rows - 1) * gap)) / 2 + r * (h + gap), w, h });
  }
  return out;
}

export interface ShareCard { src: string; name: string; tag?: string; hex?: string }
export interface ShareSpec {
  title: string;
  subtitle?: string;
  stats?: string[];
  cards: ShareCard[];
  footer: string;
}

/** The header takes the top of the image; cards get the rest. */
export const HEADER_H = 250;
export const FOOTER_H = 90;
export const cardArea = (): Rect => ({ x: 70, y: HEADER_H, w: SHARE_W - 140, h: SHARE_H - HEADER_H - FOOTER_H - 20 });
