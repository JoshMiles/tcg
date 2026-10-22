// Light markup for wording fields: **bold**, *italic*, {color:#rrggbb}word{/color}. One parser; the twin in public/widget.js
// (between the MARKUP markers) is run on the same cases by scripts/check-overlay.mts. Anything unbalanced, unknown or not a hex
// colour stays as typed. A `*` opens only before a non-space and closes only after one, so "2 * 3 * 4" and a lone `*` stay literal.
import { fillRuns, type TokenCtx } from './overlay-tokens';

export interface MarkupRun { t: string; bold?: boolean; italic?: boolean; color?: string; tok?: boolean }

const MARK = /\*\*|\*|\{color:(#[0-9a-fA-F]{6})\}|\{\/color\}/g;

export function parseMarkup(str: string): MarkupRun[] {
  const s = String(str);
  type Piece = { text: string; kind?: 'b' | 'i' | 'c'; open?: boolean; color?: string; live?: boolean };
  const pieces: Piece[] = [];
  const stack: number[] = []; // indexes of pieces that opened and are waiting for their closer
  let last = 0;
  for (const m of s.matchAll(MARK)) {
    if (m.index! > last) pieces.push({ text: s.slice(last, m.index) });
    last = m.index! + m[0].length;
    const star = m[0][0] === '*';
    const kind = star ? (m[0] === '**' ? 'b' : 'i') : 'c';
    const closes = m[0] === '{/color}' || (star && stack.some(i => pieces[i].kind === kind) && !/\s/.test(s[m.index! - 1] ?? ' '));
    if (closes) {
      let at = stack.length - 1;
      while (at >= 0 && pieces[stack[at]].kind !== kind) at--;
      if (at >= 0) {
        pieces[stack[at]].live = true;
        stack.length = at; // openers above it were never closed: they stay literal
        pieces.push({ text: m[0], kind, open: false, live: true });
        continue;
      }
    } else if (m[1] || (star && !/\s/.test(s[last] ?? ' '))) {
      stack.push(pieces.length);
      pieces.push({ text: m[0], kind, open: true, color: m[1] });
      continue;
    }
    pieces.push({ text: m[0] });
  }
  if (last < s.length) pieces.push({ text: s.slice(last) });
  // Only a matched pair (the opener flagged live by its closer) is markup; the rest is text.
  const out: MarkupRun[] = [];
  let bold = 0, italic = 0;
  const colors: string[] = [];
  for (const p of pieces) {
    if (p.kind && p.live) {
      const d = p.open ? 1 : -1;
      if (p.kind === 'b') bold += d; else if (p.kind === 'i') italic += d; else if (p.open) colors.push(p.color!); else colors.pop();
      continue;
    }
    if (!p.text) continue;
    const r: MarkupRun = { t: p.text };
    if (bold > 0) r.bold = true;
    if (italic > 0) r.italic = true;
    if (colors.length) r.color = colors[colors.length - 1].toLowerCase();
    const prev = out[out.length - 1];
    if (prev && prev.bold === r.bold && prev.italic === r.italic && prev.color === r.color) prev.t += r.t; else out.push(r);
  }
  return out;
}

/** The text without its markup (unmatched markup stays as typed). */
export const stripMarkup = (str: string): string => parseMarkup(str).map(r => r.t).join('');

/** Markup parsed, then the tokens filled inside each run (so a token value is never read as markup); `tok` marks a filled token. */
export function markupRuns(str: string, ctx: TokenCtx = {}): MarkupRun[] {
  const out: MarkupRun[] = [];
  for (const r of parseMarkup(str)) for (const f of fillRuns(r.t, ctx)) out.push({ ...r, t: f.t, ...(f.tok ? { tok: true } : {}) });
  return out;
}
