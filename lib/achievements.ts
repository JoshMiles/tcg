import type { IconName } from '@/app/components/Icon';
import type { Variant } from './types';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from './variants';
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

/** Every goal for one season. Goals that make no sense for the season (no cards of a rarity, no upgrades) are left out. */
export function evaluateSeason(s: AchSeason): Achievement[] {
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
  return out.filter((a): a is Achievement => a !== null);
}

/** Earned first (newest first when dates are known), then the closest to done. */
export function sortAchievements<T extends { earned: boolean; have: number; need: number; earnedAt?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    Number(b.earned) - Number(a.earned)
    || (b.earnedAt ?? 0) - (a.earnedAt ?? 0)
    || b.have / b.need - a.have / a.need);
}
