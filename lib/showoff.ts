import { VARIANTS, VARIANT_LABELS, type VariantCounts } from './variants';
import type { Variant } from './types';

// Showing a card off on stream from a chat command (pure, client-safe). The bot passes whatever the viewer typed after the command,
// e.g. "shiny gouda goat" or "#12"; this works out which card and version they mean and checks they really own it.

const VARIANT_WORDS: Record<string, Variant> = {
  regular: 'regular', normal: 'regular', base: 'regular',
  reverse: 'reverse', rh: 'reverse', holo: 'reverse', reverseholo: 'reverse',
  full: 'full', fa: 'full', fullart: 'full',
  shiny: 'shiny', sh: 'shiny', shinyfullart: 'shiny',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface ShowQuery {
  /** The card the viewer asked for: a number, a name, or empty for "my best card". */
  number: number | null;
  name: string;
  variant: Variant | null;
}

/** Splits "shiny gouda goat" / "gouda goat sh" / "#12 reverse" into a card and a version. Never throws. */
export function parseShowQuery(raw: unknown): ShowQuery {
  const text = typeof raw === 'number' ? `#${raw}` : typeof raw === 'string' ? raw : '';
  // Two-word version names first ("shiny full art", "full art", "reverse holo").
  const tidy = text.trim().slice(0, 80).replace(/\bshiny\s+full\s*art\b/gi, 'shiny').replace(/\bfull\s+art\b/gi, 'full').replace(/\breverse\s+holo\b/gi, 'reverse');
  const tokens = tidy.split(/\s+/).filter(Boolean);
  let variant: Variant | null = null;
  const rest: string[] = [];
  for (const t of tokens) {
    const w = VARIANT_WORDS[norm(t)];
    if (w && !variant && tokens.length > 1) variant = w;   // a lone word is a card name, whatever it is
    else rest.push(t);
  }
  const joined = rest.join(' ').trim();
  const num = /^#?(\d{1,6})$/.exec(joined);
  return { number: num ? Number(num[1]) : null, name: num ? '' : joined, variant };
}

export interface ShowCard { number: number; name: string; stars: number }

export type Resolved =
  | { ok: true; card: ShowCard }
  | { ok: false; reason: 'none' | 'not-owned' | 'ambiguous' | 'nothing-to-show'; message: string; candidates?: string[] };

/**
 * Which card a viewer means, among the cards of the season. Cards they own win over ones they do not, so a short name that matches
 * several cards still resolves when only one of them is theirs.
 */
export function resolveCard(q: ShowQuery, cards: ShowCard[], owned: ReadonlySet<number>, best: () => ShowCard | null): Resolved {
  if (q.number === null && !q.name) {
    const card = best();
    return card ? { ok: true, card } : { ok: false, reason: 'nothing-to-show', message: 'You have no cards to show yet.' };
  }
  let matches: ShowCard[];
  if (q.number !== null) matches = cards.filter(c => c.number === q.number);
  else {
    const n = norm(q.name);
    const exact = cards.filter(c => norm(c.name) === n);
    const starts = cards.filter(c => norm(c.name).startsWith(n));
    const has = cards.filter(c => norm(c.name).includes(n));
    // Prefer an exact name, then a prefix, then anywhere in the name, but only the tier that has something the viewer owns.
    matches = [exact, starts, has].find(tier => tier.some(c => owned.has(c.number))) ?? [exact, starts, has].find(t => t.length > 0) ?? [];
  }
  if (matches.length === 0) return { ok: false, reason: 'none', message: `I could not find a card called "${q.number !== null ? `#${q.number}` : q.name}".` };
  const mine = matches.filter(c => owned.has(c.number));
  if (mine.length === 0) return { ok: false, reason: 'not-owned', message: `You don't have ${matches.length === 1 ? matches[0].name : `"${q.name}"`} yet.` };
  if (mine.length > 1) return { ok: false, reason: 'ambiguous', message: `Which one? ${mine.slice(0, 3).map(c => c.name).join(', ')}${mine.length > 3 ? '…' : ''}`, candidates: mine.slice(0, 3).map(c => c.name) };
  return { ok: true, card: mine[0] };
}

/** The version to show: the one asked for (if they own it), else the best they own. */
export function pickShowVariant(counts: VariantCounts, wanted: Variant | null): { ok: true; variant: Variant } | { ok: false; message: string } {
  if (wanted) {
    if (counts[wanted] > 0) return { ok: true, variant: wanted };
    const have = VARIANTS.filter(v => counts[v] > 0).map(v => VARIANT_LABELS[v]);
    return { ok: false, message: `You don't have the ${VARIANT_LABELS[wanted]} version${have.length ? ` (you have ${have.join(', ')})` : ''}.` };
  }
  const best = [...VARIANTS].reverse().find(v => counts[v] > 0);
  return best ? { ok: true, variant: best } : { ok: false, message: 'You do not own that card.' };
}
