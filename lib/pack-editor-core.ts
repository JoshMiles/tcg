// The pack workspace's pure core (ROADMAP 20.2): the working state of a pack and its cards, the change set between two states, how the
// server applies it, the "old -> new" lines of Review, and how a change set is re-applied on top of someone else's save. Client-safe (no
// database): the workspace shows the result of `applyChanges` and the server saves the result of the SAME function, so they can't differ.
import type { Card, OptionalVariant, Pack } from './types';
import { cardProblems, cleanPackInput, int, MAX_CARD_NUMBER, num, str, type PackInput } from './pack-clean';
import { cleanDisabled } from './variants';

/** A card as the workspace edits it: empty strings for "none" so inputs stay controlled. `number` is 0 for a card not saved yet. */
export interface WorkCard {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  fullArtImageUrl: string;
  stillUrl: string;
  fullArtStillUrl: string;
  soundUrl: string;
  stars: number;
  probability: number;
  upgradesEnabled: boolean;
  disabledVariants: OptionalVariant[];
}
export type CardFields = Omit<WorkCard, 'id'>;

export interface Work { pack: PackInput; cards: WorkCard[] }

/** What changed against the saved state: the pack's changed fields, new cards, changed fields of existing cards, removed card ids. */
export interface ChangeSet {
  pack: Partial<PackInput>;
  add: WorkCard[];
  update: Record<string, Partial<CardFields>>;
  remove: string[];
}

export const packToInput = (p: Pack): PackInput => ({
  name: p.name, coverImageUrl: p.coverImageUrl, active: p.active, weight: p.weight, accentColor: p.accentColor, tearBorderColor: p.tearBorderColor,
  holoMinStars: p.holoMinStars, cardTime: p.cardTime, cooldownTime: p.cooldownTime, soundVolume: p.soundVolume, upgradesEnabled: p.upgradesEnabled,
  variantWeights: { ...p.variantWeights }, upgradeCosts: { ...p.upgradeCosts }, disabledVariants: [...(p.disabledVariants ?? [])],
});

export const cardToWork = (c: Card): WorkCard => ({
  id: c.id, number: c.number, name: c.name, imageUrl: c.imageUrl, fullArtImageUrl: c.fullArtImageUrl ?? '', stillUrl: c.stillUrl ?? '',
  fullArtStillUrl: c.fullArtStillUrl ?? '', soundUrl: c.soundUrl ?? '', stars: c.stars, probability: c.probability,
  upgradesEnabled: c.upgradesEnabled !== false, disabledVariants: [...(c.disabledVariants ?? [])],
});

export function newWorkCard(id: string, over: Partial<CardFields> = {}): WorkCard {
  return { id, number: 0, name: '', imageUrl: '', fullArtImageUrl: '', stillUrl: '', fullArtStillUrl: '', soundUrl: '', stars: 1, probability: 10, upgradesEnabled: true, disabledVariants: [], ...over };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const CARD_KEYS: (keyof CardFields)[] = ['number', 'name', 'imageUrl', 'fullArtImageUrl', 'stillUrl', 'fullArtStillUrl', 'soundUrl', 'stars', 'probability', 'upgradesEnabled', 'disabledVariants'];

export function diffChanges(base: Work, work: Work): ChangeSet {
  const pack: Partial<PackInput> = {};
  for (const k of Object.keys(work.pack) as (keyof PackInput)[]) if (!same(base.pack[k], work.pack[k])) (pack as Record<string, unknown>)[k] = work.pack[k];
  const baseById = new Map(base.cards.map(c => [c.id, c]));
  const workIds = new Set(work.cards.map(c => c.id));
  const add: WorkCard[] = [];
  const update: Record<string, Partial<CardFields>> = {};
  for (const c of work.cards) {
    const b = baseById.get(c.id);
    if (!b) { add.push(c); continue; }
    const d: Record<string, unknown> = {};
    for (const k of CARD_KEYS) if (!same(b[k], c[k])) d[k] = c[k];
    if (Object.keys(d).length > 0) update[c.id] = d as Partial<CardFields>;
  }
  return { pack, add, update, remove: base.cards.filter(c => !workIds.has(c.id)).map(c => c.id) };
}

export const isEmptyChange = (c: ChangeSet) => Object.keys(c.pack).length === 0 && c.add.length === 0 && Object.keys(c.update).length === 0 && c.remove.length === 0;

/** The card the server stores for a working card (the same limits `saveCards` has always applied). */
function cleanCard(w: WorkCard, number: number): Card {
  const full = str(w.fullArtImageUrl) || undefined;
  const still = str(w.stillUrl) || undefined;
  const fullStill = full ? str(w.fullArtStillUrl) || undefined : undefined;
  const sound = str(w.soundUrl) || undefined;
  const off = cleanDisabled(w.disabledVariants);
  return {
    id: w.id, number, name: str(w.name, 80).trim(), imageUrl: str(w.imageUrl),
    ...(sound && { soundUrl: sound }), ...(full && { fullArtImageUrl: full }), ...(still && { stillUrl: still }), ...(fullStill && { fullArtStillUrl: fullStill }),
    ...(off.length > 0 && { disabledVariants: off }),
    upgradesEnabled: w.upgradesEnabled !== false, probability: num(w.probability, 1, 0), stars: int(w.stars, 1),
  };
}

export interface Applied {
  pack: Pack;
  cards: Card[];
  /** The number the server gave each new card, by its id. */
  assigned: Record<string, number>;
  /** Cards (and the pack) whose fields would not pass `cardProblems`. */
  problems: { id: string; name: string; messages: string[] }[];
}

/** The saved pack and cards after `changes`. Existing cards keep their numbers (unless the change renumbers one); new cards get the next free number above everything that ever existed here. */
export function applyChanges(pack: Pack, cards: Card[], changes: ChangeSet): Applied {
  const nextPack: Pack = Object.keys(changes.pack).length > 0 ? { ...pack, ...cleanPackInput({ ...packToInput(pack), ...changes.pack }) } : pack;
  const removed = new Set(changes.remove);
  let next = cards.reduce((m, c) => Math.max(m, c.number), 0);
  const out: Card[] = [];
  for (const c of cards) {
    if (removed.has(c.id)) continue;
    const u = changes.update[c.id];
    out.push(u ? cleanCard({ ...cardToWork(c), ...u } as WorkCard, typeof u.number === 'number' ? u.number : c.number) : c);
  }
  const assigned: Record<string, number> = {};
  const seen = new Set(out.map(c => c.id));
  const used = new Set(cards.map(c => c.number)); // every number that ever existed here, removed cards included
  for (const a of changes.add) {
    if (typeof a.id !== 'string' || !a.id || seen.has(a.id)) continue;
    seen.add(a.id);
    // A new card may ask for a number (an imported file named "012 Gouda Goat") and gets it when it is free; otherwise the next one above everything.
    const asked = Number.isInteger(a.number) && a.number > 0 && a.number <= MAX_CARD_NUMBER && !used.has(a.number) ? a.number : 0;
    const n = asked || (() => { while (used.has(++next)) { /* next free */ } return next; })();
    used.add(n); if (n > next) next = n;
    assigned[a.id] = n;
    out.push(cleanCard(a, n));
  }
  out.sort((a, b) => a.number - b.number);
  const problems: Applied['problems'] = [];
  const touched = new Set([...Object.keys(changes.update), ...changes.add.map(a => a.id)]);
  for (const c of out) {
    if (!touched.has(c.id)) continue; // an old card nobody edited does not block saving something else
    const messages = cardProblems({ name: c.name, stars: c.stars, probability: c.probability, number: c.number }, out.filter(o => o !== c).map(o => o.number));
    if (messages.length > 0) problems.push({ id: c.id, name: c.name, messages });
  }
  if (!nextPack.name.trim()) problems.unshift({ id: 'pack', name: 'Pack', messages: ['Give the pack a name.'] });
  return { pack: nextPack, cards: out, assigned, problems };
}

/** The working state a saved result corresponds to. */
export const workOf = (pack: Pack, cards: Card[]): Work => ({ pack: packToInput(pack), cards: cards.map(cardToWork) });

// ── Review ("old -> new" per field) ──────────────────────

export interface ReviewLine { scope: string; field: string; from: string; to: string }

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', coverImageUrl: 'Cover', active: 'In draws', weight: 'Draw weight', accentColor: 'Accent colour', tearBorderColor: 'Tear colour', holoMinStars: 'Holo from stars',
  cardTime: 'Card time', cooldownTime: 'Cooldown', soundVolume: 'Volume', upgradesEnabled: 'Variants and upgrades', variantWeights: 'Version weights', upgradeCosts: 'Upgrade costs',
  disabledVariants: 'Versions off', number: 'Number', imageUrl: 'Art', fullArtImageUrl: 'Full art', stillUrl: 'Still frame', fullArtStillUrl: 'Full art still', soundUrl: 'Sound',
  stars: 'Stars', probability: 'Odds',
};
export const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k;

function show(k: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (v === '' || v === undefined || v === null) return 'none';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([a, b]) => `${a} ${b}`).join(', ');
  if (typeof v === 'string' && /^https?:\/\/|^\//.test(v)) return v.split('/').pop()?.slice(0, 40) || 'set';
  return String(v);
}

export function reviewLines(base: Work, work: Work): ReviewLine[] {
  const cs = diffChanges(base, work);
  const out: ReviewLine[] = [];
  for (const [k, v] of Object.entries(cs.pack)) out.push({ scope: 'Pack', field: fieldLabel(k), from: show(k, (base.pack as unknown as Record<string, unknown>)[k]), to: show(k, v) });
  const baseById = new Map(base.cards.map(c => [c.id, c]));
  for (const [id, d] of Object.entries(cs.update)) {
    const b = baseById.get(id)!;
    const label = `#${b.number} ${b.name || 'Untitled'}`;
    for (const [k, v] of Object.entries(d)) out.push({ scope: label, field: fieldLabel(k), from: show(k, (b as unknown as Record<string, unknown>)[k]), to: show(k, v) });
  }
  for (const a of cs.add) out.push({ scope: a.name || 'New card', field: 'Card', from: 'none', to: 'added' });
  for (const id of cs.remove) { const b = baseById.get(id)!; out.push({ scope: `#${b.number} ${b.name || 'Untitled'}`, field: 'Card', from: 'there', to: 'removed' }); }
  return out;
}

// ── Someone else saved first ─────────────────────────────

/**
 * Re-applies `mine` (your unsaved changes, made against `oldBase`) on top of `newBase` (what is saved now). A field you changed that someone
 * else also changed to something different keeps THEIR value and is listed as a clash; everything else of yours is kept.
 */
export function rebase(oldBase: Work, newBase: Work, mine: ChangeSet): { work: Work; clashes: string[] } {
  const clashes: string[] = [];
  const pack: PackInput = { ...newBase.pack };
  for (const [k, v] of Object.entries(mine.pack)) {
    const key = k as keyof PackInput;
    if (!same(newBase.pack[key], oldBase.pack[key]) && !same(newBase.pack[key], v)) clashes.push(`Pack: ${fieldLabel(k)}`);
    else (pack as unknown as Record<string, unknown>)[k] = v;
  }
  const cards = newBase.cards.map(c => ({ ...c }));
  const byId = new Map(cards.map(c => [c.id, c]));
  const oldById = new Map(oldBase.cards.map(c => [c.id, c]));
  for (const [id, d] of Object.entries(mine.update)) {
    const cur = byId.get(id);
    const was = oldById.get(id);
    if (!cur || !was) { clashes.push(`${was ? `#${was.number} ${was.name}` : 'A card'}: removed by someone else`); continue; }
    for (const [k, v] of Object.entries(d)) {
      const key = k as keyof CardFields;
      if (!same(cur[key], was[key]) && !same(cur[key], v)) clashes.push(`#${cur.number} ${cur.name || 'Untitled'}: ${fieldLabel(k)}`);
      else (cur as unknown as Record<string, unknown>)[k] = v;
    }
  }
  for (const a of mine.add) if (!byId.has(a.id)) cards.push(a);
  const gone = new Set(mine.remove);
  return { work: { pack, cards: cards.filter(c => !gone.has(c.id)) }, clashes };
}

// ── Bulk edits (20.2c) ───────────────────────────────────

export type BulkOp =
  | { kind: 'stars'; value: number }
  | { kind: 'weight'; value: number }
  | { kind: 'multiply'; factor: number }
  | { kind: 'version'; variant: OptionalVariant; on: boolean }
  | { kind: 'sound'; mode: 'default' | 'clear' }
  | { kind: 'upgrades'; on: boolean };

/** The bundled sound of the first 25 cards, or '' when a card has none. */
export const defaultSoundFor = (number: number) => (number >= 1 && number <= 25 ? `/assets/sounds/${number}.mp3` : '');

/** `op` applied to the cards in `ids` (the others, and the order, are untouched). A card the op cannot change is returned as it was. */
export function bulkApply(cards: WorkCard[], ids: Set<string>, op: BulkOp): WorkCard[] {
  return cards.map(c => {
    if (!ids.has(c.id)) return c;
    switch (op.kind) {
      case 'stars': return { ...c, stars: Math.min(5, Math.max(1, Math.round(op.value) || 1)) };
      case 'weight': return Number.isFinite(op.value) && op.value >= 0 ? { ...c, probability: op.value } : c;
      case 'multiply': return Number.isFinite(op.factor) && op.factor >= 0 ? { ...c, probability: Math.round(c.probability * op.factor * 10_000) / 10_000 } : c;
      case 'version': {
        const off = new Set(c.disabledVariants);
        if (op.on) off.delete(op.variant); else off.add(op.variant);
        return { ...c, disabledVariants: [...off] as OptionalVariant[] };
      }
      case 'sound': { const s = op.mode === 'clear' ? '' : defaultSoundFor(c.number); return op.mode === 'default' && !s ? c : { ...c, soundUrl: s }; }
      case 'upgrades': return { ...c, upgradesEnabled: op.on };
    }
  });
}

/** Lines pasted from a spreadsheet column (one value per line; a trailing empty line is dropped). */
export function pastedColumn(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.map(l => l.split('\t')[0].trim());
}
