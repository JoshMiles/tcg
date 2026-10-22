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

/** A styled stretch of a plain text, as character offsets (`to` exclusive). Colour never changes a width. */
export interface TextMark { from: number; to: number; bold?: boolean; italic?: boolean; color?: string }

/**
 * The card back's text: the markup stripped to the plain string the line breaker works on, plus the styled stretches as offsets into it.
 * `marks` is absent when nothing is styled, so unmarked text is exactly what it was. Runs of spaces collapse to one (the line breaker would
 * collapse them and shift the offsets).
 */
export function markedText(str: string): { text: string; marks?: TextMark[] } {
  let text = '';
  const marks: TextMark[] = [];
  for (const r of parseMarkup(str)) {
    const from = text.length;
    for (const ch of r.t) if (!(ch === ' ' && text.endsWith(' '))) text += ch;
    if ((r.bold || r.italic || r.color) && text.length > from) marks.push({ from, to: text.length, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(r.color ? { color: r.color } : {}) });
  }
  return marks.length ? { text, marks } : { text };
}

/**
 * One line's text (`t`, which starts at offset `o` of the plain text) split at the marks' edges, each piece with its style. `ell`: the line ends
 * in an ellipsis the line breaker added; it takes the style of the character before it.
 */
export function markPieces(t: string, o: number, marks?: TextMark[], ell?: boolean): { t: string; bold?: boolean; italic?: boolean; color?: string }[] {
  const body = ell ? t.slice(0, -1) : t;
  const cuts = new Set([0, body.length]);
  for (const m of marks ?? []) for (const c of [m.from - o, m.to - o]) if (c > 0 && c < body.length) cuts.add(c);
  const at = [...cuts].sort((a, b) => a - b);
  const out: { t: string; bold?: boolean; italic?: boolean; color?: string }[] = [];
  for (let i = 0; i < at.length - 1; i++) {
    const m = (marks ?? []).find(k => k.from <= o + at[i] && o + at[i] < k.to);
    out.push({ t: body.slice(at[i], at[i + 1]), ...(m?.bold ? { bold: true } : {}), ...(m?.italic ? { italic: true } : {}), ...(m?.color ? { color: m.color } : {}) });
  }
  if (ell) {
    const last = out[out.length - 1];
    if (last) last.t += '…'; else out.push({ t: '…' });
  }
  return out;
}
