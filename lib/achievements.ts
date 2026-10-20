import type { IconName } from '@/app/components/Icon';
import type { Variant } from './types';
import { GOLDEN_PULLS, VARIANTS, VARIANT_LABELS, decodeEntry, type VariantCounts } from './variants';
import { RARITIES } from './rarity';

// Profile achievements (pure, client-safe): collection goals per season, such as completing the season, owning every card of a
// rarity, or every card in a version, plus goals for completed trades. `evaluateSeason` says what is earned and how far along
// each goal is; lib/achievements-store.ts remembers what was earned so a goal is never taken back when copies are traded away.

export interface AchCard { number: number; stars: number; /** The versions this card can be pulled in (Regular only where upgrades are off). */ variants: Variant[] }

export interface AchSeason {
  seasonId: string;
  seasonName: string;
  cards: AchCard[];
  /** The viewer's copies per card number, by version. */
  counts: Map<number, VariantCounts>;
  /** The print numbers they hold, by entry (card + version), when the season's copies are numbered. Switches on the serial milestones. */
  held?: Map<number, number[]>;
  /** The serial bonus cutoff (editions up to this number earn extra points; 0 = none). */
  bonusCutoff?: number;
}

export interface Achievement {
  /** `<seasonId>:<kind>`, stable, so it can be stored. */
  id: string;
  seasonId: string;
  seasonName: string;
  title: string;
  detail: string;
  icon: IconName;
  have: number;
  need: number;
  earned: boolean;
  /** The print bonus cutoff, only on Early bird (fills `{cutoff}`). */
  cutoff?: number;
}

/** Trade goals belong to no season; they live under this pseudo-season id. */
export const TRADING = 'trading';

/** The built-in title and detail for each kind, with `{placeholders}`: the one source for what a goal says (the editor shows these). */
export const DEFAULT_TEXT: Record<string, { title: string; detail: string }> = {
  complete: { title: 'Completed {season}', detail: 'Own at least one of every card in {season}.' },
  master: { title: 'Master set: {season}', detail: 'Own every card in every version in {season}.' },
  tier: { title: 'All {rarity}', detail: 'Own every {rarity} card in {season}.' },
  all: { title: 'All {version}', detail: 'Own the {version} version of every card that has one in {season}.' },
  'first-edition': { title: 'First print', detail: 'Hold print #1 of any card in {season}: the very first edition ever made.' },
  'first-shiny': { title: 'First Full Art Holo print', detail: 'Hold print #1 of a Full Art Holo card in {season}.' },
  'five-firsts': { title: 'Five firsts', detail: 'Hold print #1 of {need} different cards in {season}.' },
  'early-bird': { title: 'Early bird', detail: 'Hold an edition with a low enough print number (#{cutoff} or lower) to earn the print bonus in {season}.' },
  'first-trade': { title: 'First trade', detail: 'Complete your first trade.' },
  'ten-trades': { title: 'Ten trades', detail: 'Complete {need} trades.' },
};

/** The built-in title and detail template for a kind (`tier-3` and `all-shiny` share one template each). */
export const defaultText = (kind: string) => DEFAULT_TEXT[kind.startsWith('tier-') ? 'tier' : kind.startsWith('all-') ? 'all' : kind];

/** The placeholders staff can use. */
export const PLACEHOLDERS: { word: string; means: string }[] = [
  { word: 'season', means: 'the season name (empty for trading goals)' },
  { word: 'need', means: 'the goal target' },
  { word: 'rarity', means: 'the rarity name (rarity goals)' },
  { word: 'version', means: 'the version name (version goals)' },
  { word: 'cutoff', means: 'the print bonus cutoff (Early bird)' },
];

/** Fills `{word}` from `vars`; a word with no value is left as typed. */
export const fillText = (text: string, vars: Record<string, string | number | undefined>) =>
  text.replace(/\{(\w+)\}/g, (m, w: string) => (vars[w] === undefined ? m : String(vars[w])));

/** The placeholder values an achievement can supply from its own fields. */
export function achVars(a: { id: string; seasonId: string; seasonName: string; need: number; cutoff?: number }): Record<string, string | number | undefined> {
  const kind = a.id.slice(a.seasonId.length + 1);
  const stars = kind.startsWith('tier-') ? Number(kind.slice(5)) : undefined;
  const v = kind.startsWith('all-') ? kind.slice(4) as Variant : undefined;
  return {
    season: a.seasonId === TRADING ? '' : a.seasonName,
    need: a.need,
    rarity: stars === undefined ? undefined : RARITIES.find(r => r.stars === stars)?.label,
    version: v && VARIANT_LABELS[v],
    cutoff: a.cutoff,
  };
}

// ── Custom goals (staff-made, KV `achievements:custom`) ──

export const CUSTOM_ICONS: IconName[] = ['award', 'trophy', 'star', 'gem', 'sparkles', 'cheese', 'crown', 'medal', 'zap', 'heart', 'target', 'trade'];
export const CUSTOM_RULES = {
  unique: 'Own N different cards',
  editions: 'Hold N editions in total (duplicates count)',
  rarity: 'Own N different cards of a rarity',
  version: 'Own N different cards in a version',
  firsts: 'Hold print #1 of N different cards',
  trades: 'Complete N trades (all seasons)',
} as const;
export type CustomRuleType = keyof typeof CUSTOM_RULES;
export interface CustomGoal {
  id: string;
  on: boolean;
  title: string;
  detail: string;
  icon: IconName;
  rule: { type: CustomRuleType; n: number; stars?: number; variant?: Variant };
  /** A buff from the Buff Editor, given the first time a player earns this goal. */
  buffId?: string;
}
export const CUSTOM_MAX = 50;
export const CUSTOM_N_MAX = 1000;
export const TITLE_MAX = 80;
export const DETAIL_MAX = 200;

const clipText = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Drops unknown rules and duplicate ids, caps text and numbers. */
export function normalizeCustomGoals(input: unknown): CustomGoal[] {
  if (!Array.isArray(input)) return [];
  const out: CustomGoal[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const rule = (r.rule && typeof r.rule === 'object' ? r.rule : {}) as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) : '';
    const type = rule.type as CustomRuleType;
    const title = clipText(r.title, TITLE_MAX);
    if (!id || seen.has(id) || !(type in CUSTOM_RULES) || !title) continue;
    const n = Math.min(CUSTOM_N_MAX, Math.max(1, Math.floor(Number(rule.n)) || 1));
    const stars = RARITIES.find(x => x.stars === Number(rule.stars))?.stars;
    const variant = VARIANTS.find(v => v === rule.variant);
    if ((type === 'rarity' && stars === undefined) || (type === 'version' && !variant)) continue;
    seen.add(id);
    out.push({
      id, on: r.on !== false, title, detail: clipText(r.detail, DETAIL_MAX),
      icon: CUSTOM_ICONS.find(i => i === r.icon) ?? 'award',
      rule: { type, n, ...(type === 'rarity' ? { stars } : {}), ...(type === 'version' ? { variant } : {}) },
      ...(typeof r.buffId === 'string' && r.buffId.trim() ? { buffId: r.buffId.trim().slice(0, 60) } : {}),
    });
    if (out.length >= CUSTOM_MAX) break;
  }
  return out;
}

const owns = (s: AchSeason, number: number, v?: Variant): boolean => {
  const c = s.counts.get(number);
  if (!c) return false;
  return v ? c[v] > 0 : VARIANTS.some(x => c[x] > 0);
};

/** A built-in goal's words: its default template for `kind`, filled from the goal's own fields. */
function words(kind: string, a: { seasonId: string; seasonName: string; need: number; cutoff?: number }) {
  const t = defaultText(kind);
  const vars = achVars({ ...a, id: `${a.seasonId}:${kind}` });
  return { title: fillText(t.title, vars), detail: fillText(t.detail, vars) };
}

function goal(s: AchSeason, kind: string, icon: IconName, cards: AchCard[], has: (c: AchCard) => boolean): Achievement | null {
  if (cards.length === 0) return null;
  const have = cards.filter(has).length;
  return { id: `${s.seasonId}:${kind}`, seasonId: s.seasonId, seasonName: s.seasonName, ...words(kind, { ...s, need: cards.length }), icon, have, need: cards.length, earned: have === cards.length };
}

/** Every goal for one season. Goals that make no sense for the season (no cards of a rarity, no upgrades) are left out. A kind in `disabled` is left out too; stored earned rows are not touched here. */
export function evaluateSeason(s: AchSeason, disabled?: ReadonlySet<string>, custom: CustomGoal[] = []): Achievement[] {
  const out: (Achievement | null)[] = [];
  out.push(goal(s, 'complete', 'cheese', s.cards, c => owns(s, c.number)));

  for (const tier of [...RARITIES].sort((a, b) => a.stars - b.stars)) {
    const cards = s.cards.filter(c => c.stars === tier.stars);
    out.push(goal(s, `tier-${tier.stars}`, 'award', cards, c => owns(s, c.number)));
  }

  for (const v of VARIANTS.filter(x => x !== 'regular' && (GOLDEN_PULLS || x !== 'golden'))) {
    const cards = s.cards.filter(c => c.variants.includes(v));
    out.push(goal(s, `all-${v}`, v === 'shiny' || v === 'golden' ? 'sparkles' : 'gem', cards, c => owns(s, c.number, v)));
  }

  // The master set: every card in every version it can be pulled in. Only meaningful when some card has more than one version.
  const liveVariants = (c: AchCard) => GOLDEN_PULLS ? c.variants : c.variants.filter(v => v !== 'golden');
  if (s.cards.some(c => liveVariants(c).length > 1)) {
    const wanted = s.cards.flatMap(c => liveVariants(c).map(v => ({ number: c.number, stars: c.stars, variants: [v] as Variant[] })));
    out.push(goal(s, 'master', 'trophy', wanted, c => owns(s, c.number, c.variants[0])));
  }
  if (s.held) out.push(...serialGoals(s));
  out.push(...custom.filter(c => c.on && c.rule.type !== 'trades').map(c => customGoal(s, c)));
  return out.filter((a): a is Achievement => a !== null && !disabled?.has(a.id.slice(s.seasonId.length + 1)));
}

/** One staff-made goal for a season. N is capped at the qualifying cards (not for editions held); no qualifying cards, no goal. */
function customGoal(s: AchSeason, g: CustomGoal): Achievement | null {
  const { type, n, stars, variant } = g.rule;
  let cards = s.cards;
  if (type === 'rarity') cards = cards.filter(c => c.stars === stars);
  if (type === 'version') cards = cards.filter(c => c.variants.includes(variant!));
  if (cards.length === 0) return null;
  let have = 0;
  if (type === 'unique' || type === 'rarity') have = cards.filter(c => owns(s, c.number)).length;
  if (type === 'version') have = cards.filter(c => owns(s, c.number, variant)).length;
  if (type === 'editions') have = [...s.counts.values()].reduce((t, c) => t + VARIANTS.reduce((x, v) => x + c[v], 0), 0);
  if (type === 'firsts') {
    if (!s.held) return null;
    have = new Set([...s.held].filter(([, list]) => list.includes(1)).map(([entry]) => decodeEntry(entry).cardNumber)).size;
  }
  const label = type === 'rarity' ? RARITIES.find(r => r.stars === stars)?.label : type === 'version' ? VARIANT_LABELS[variant!] : undefined;
  return customAch(g, s.seasonId, s.seasonName, have, type === 'editions' ? n : Math.min(n, cards.length), label);
}

function customAch(g: CustomGoal, seasonId: string, seasonName: string, have: number, need: number, label?: string): Achievement {
  const vars = { season: seasonId === TRADING ? '' : seasonName, need, n: need, rarity: g.rule.type === 'rarity' ? label : undefined, version: g.rule.type === 'version' ? label : undefined };
  return { id: `${seasonId}:custom-${g.id}`, seasonId, seasonName, title: fillText(g.title, vars), detail: fillText(g.detail, vars), icon: g.icon, have: Math.min(have, need), need, earned: have >= need };
}

/** Goals about completed trades, across every season. `count` is how many trades the player has finished. */
export function tradingGoals(count: number, disabled: ReadonlySet<string>, custom: CustomGoal[] = []): Achievement[] {
  const base = { seasonId: TRADING, seasonName: 'Trading' };
  const mk = (kind: string, need: number): Achievement => ({ id: `${TRADING}:${kind}`, ...base, ...words(kind, { ...base, need }), icon: 'trade', have: Math.min(count, need), need, earned: count >= need });
  const list = [mk('first-trade', 1), mk('ten-trades', 10), ...custom.filter(c => c.on && c.rule.type === 'trades').map(c => customAch(c, TRADING, 'Trading', count, c.rule.n))];
  return list.filter(a => !disabled.has(a.id.slice(TRADING.length + 1)));
}

/** One-off goals about the numbers on the copies you hold: first editions and early numbers. Needs the season's copies to be numbered. */
export function serialGoals(s: AchSeason): Achievement[] {
  if (!s.held) return [];
  const goals: Achievement[] = [];
  const mk = (kind: string, icon: IconName, have: number, need: number): Achievement => {
    const cutoff = kind === 'early-bird' ? s.bonusCutoff : undefined;
    return { id: `${s.seasonId}:${kind}`, seasonId: s.seasonId, seasonName: s.seasonName, ...words(kind, { ...s, need, cutoff }), icon, have: Math.min(have, need), need, earned: have >= need, ...(cutoff ? { cutoff } : {}) };
  };

  const firsts = new Map<number, Set<Variant>>(); // card -> versions whose print #1 they hold
  let early = 0;
  for (const [entry, list] of s.held) {
    const { cardNumber, variant } = decodeEntry(entry);
    if (list.includes(1)) firsts.set(cardNumber, (firsts.get(cardNumber) ?? new Set()).add(variant));
    if ((s.bonusCutoff ?? 0) > 0 && list.some(n => n <= (s.bonusCutoff ?? 0))) early++;
  }
  goals.push(mk('first-edition', 'gem', firsts.size > 0 ? 1 : 0, 1));
  if (s.cards.some(c => c.variants.includes('shiny'))) {
    const shinyFirst = [...firsts.values()].some(v => v.has('shiny'));
    goals.push(mk('first-shiny', 'sparkles', shinyFirst ? 1 : 0, 1));
  }
  goals.push(mk('five-firsts', 'award', firsts.size, Math.min(5, Math.max(1, s.cards.length))));
  if ((s.bonusCutoff ?? 0) > 0) goals.push(mk('early-bird', 'zap', early > 0 ? 1 : 0, 1));
  return goals;
}

/** Earned first (newest first when dates are known), then the closest to done. */
export function sortAchievements<T extends { earned: boolean; have: number; need: number; earnedAt?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    Number(b.earned) - Number(a.earned)
    || (b.earnedAt ?? 0) - (a.earnedAt ?? 0)
    || b.have / b.need - a.have / a.need);
}
