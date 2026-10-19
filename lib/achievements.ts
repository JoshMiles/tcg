import type { IconName } from '@/app/components/Icon';
import type { Variant } from './types';
import { VARIANTS, VARIANT_LABELS, decodeEntry, type VariantCounts } from './variants';
import { RARITIES } from './rarity';

// Profile achievements (pure, client-safe): collection goals per season, such as completing the season, owning every card of a
// rarity, or every card in a version. `evaluateSeason` says what is earned and how far along each goal is; lib/achievements-store.ts
// remembers what was earned so a goal is never taken back when copies are traded away.

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
}

const owns = (s: AchSeason, number: number, v?: Variant): boolean => {
  const c = s.counts.get(number);
  if (!c) return false;
  return v ? c[v] > 0 : VARIANTS.some(x => c[x] > 0);
};

function goal(s: AchSeason, kind: string, title: string, detail: string, icon: IconName, cards: AchCard[], has: (c: AchCard) => boolean): Achievement | null {
  if (cards.length === 0) return null;
  const have = cards.filter(has).length;
  return { id: `${s.seasonId}:${kind}`, seasonId: s.seasonId, seasonName: s.seasonName, title, detail, icon, have, need: cards.length, earned: have === cards.length };
}

/** Every goal for one season. Goals that make no sense for the season (no cards of a rarity, no upgrades) are left out. A kind in `disabled` is left out too; stored earned rows are not touched here. */
export function evaluateSeason(s: AchSeason, disabled?: ReadonlySet<string>): Achievement[] {
  const out: (Achievement | null)[] = [];
  out.push(goal(s, 'complete', `Completed ${s.seasonName}`, `Own at least one of every card in ${s.seasonName}.`, 'cheese', s.cards, c => owns(s, c.number)));

  for (const tier of [...RARITIES].sort((a, b) => a.stars - b.stars)) {
    const cards = s.cards.filter(c => c.stars === tier.stars);
    out.push(goal(s, `tier-${tier.stars}`, `All ${tier.label}`, `Own every ${tier.label} card in ${s.seasonName}.`, 'award', cards, c => owns(s, c.number)));
  }

  for (const v of VARIANTS.filter(x => x !== 'regular')) {
    const cards = s.cards.filter(c => c.variants.includes(v));
    out.push(goal(s, `all-${v}`, `All ${VARIANT_LABELS[v]}`, `Own the ${VARIANT_LABELS[v]} version of every card that has one in ${s.seasonName}.`, v === 'shiny' ? 'sparkles' : 'gem', cards, c => owns(s, c.number, v)));
  }

  // The master set: every card in every version it can be pulled in. Only meaningful when some card has more than one version.
  if (s.cards.some(c => c.variants.length > 1)) {
    const wanted = s.cards.flatMap(c => c.variants.map(v => ({ number: c.number, stars: c.stars, variants: [v] as Variant[] })));
    out.push(goal(s, 'master', `Master set: ${s.seasonName}`, `Own every card in every version in ${s.seasonName}.`, 'trophy', wanted, c => owns(s, c.number, c.variants[0])));
  }
  if (s.held) out.push(...serialGoals(s));
  return out.filter((a): a is Achievement => a !== null && !disabled?.has(a.id.slice(s.seasonId.length + 1)));
}

/** One-off goals about the numbers on the copies you hold: first editions and early numbers. Needs the season's copies to be numbered. */
export function serialGoals(s: AchSeason): Achievement[] {
  if (!s.held) return [];
  const goals: Achievement[] = [];
  const mk = (kind: string, title: string, detail: string, icon: IconName, have: number, need: number): Achievement =>
    ({ id: `${s.seasonId}:${kind}`, seasonId: s.seasonId, seasonName: s.seasonName, title, detail, icon, have: Math.min(have, need), need, earned: have >= need });

  const firsts = new Map<number, Set<Variant>>(); // card -> versions whose print #1 they hold
  let early = 0;
  for (const [entry, list] of s.held) {
    const { cardNumber, variant } = decodeEntry(entry);
    if (list.includes(1)) firsts.set(cardNumber, (firsts.get(cardNumber) ?? new Set()).add(variant));
    if ((s.bonusCutoff ?? 0) > 0 && list.some(n => n <= (s.bonusCutoff ?? 0))) early++;
  }
  goals.push(mk('first-edition', 'First print', `Hold print #1 of any card in ${s.seasonName}: the very first edition ever made.`, 'gem', firsts.size > 0 ? 1 : 0, 1));
  if (s.cards.some(c => c.variants.includes('shiny'))) {
    const shinyFirst = [...firsts.values()].some(v => v.has('shiny'));
    goals.push(mk('first-shiny', 'First shiny print', `Hold print #1 of a Shiny Full Art card in ${s.seasonName}.`, 'sparkles', shinyFirst ? 1 : 0, 1));
  }
  goals.push(mk('five-firsts', 'Five firsts', `Hold print #1 of five different cards in ${s.seasonName}.`, 'award', firsts.size, Math.min(5, Math.max(1, s.cards.length))));
  if ((s.bonusCutoff ?? 0) > 0) goals.push(mk('early-bird', 'Early bird', `Hold an edition with a low enough print number (#${s.bonusCutoff} or lower) to earn the print bonus in ${s.seasonName}.`, 'zap', early > 0 ? 1 : 0, 1));
  return goals;
}

/** Earned first (newest first when dates are known), then the closest to done. */
export function sortAchievements<T extends { earned: boolean; have: number; need: number; earnedAt?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    Number(b.earned) - Number(a.earned)
    || (b.earnedAt ?? 0) - (a.earnedAt ?? 0)
    || b.have / b.need - a.have / a.need);
}
