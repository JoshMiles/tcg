// "What to do next" for My Stats (pure, client-safe): turns a viewer's stats into a few concrete suggestions, best first.

export interface MissingCard { number: number; name: string; stars: number; pullRate: number; /** Points one Regular copy is worth right now. */ value: number }

export interface AdviceInput {
  /** How many cards they own at least one of, and how many exist. */
  uniqueCards: number;
  totalCards: number;
  complete: boolean;
  /** What the bonuses are worth in total at 100% / once complete (see UserStats). */
  maxCompletionBonus: number;
  completeSetBonusValue: number;
  /** The upgrade with the best projected gain, if any is affordable. */
  bestUpgrade?: { cardName: string; fromLabel: string; toLabel: string; gain: number; cost: number };
  missing: MissingCard[];
  /** The collector one place above, and the points needed to pass them. */
  nextRank?: { username: string; gap: number } | null;
}

export interface Advice { id: string; icon: 'arrowUp' | 'search' | 'trophy' | 'cheese'; title: string; detail: string; points?: number; href?: string }

/** What finding one more card is worth: its own points plus its share of the completion bonus. */
export function missingGain(card: MissingCard, input: Pick<AdviceInput, 'maxCompletionBonus' | 'totalCards'>): number {
  return Math.round(card.value + (input.totalCards > 0 ? input.maxCompletionBonus / input.totalCards : 0));
}

export function buildAdvice(i: AdviceInput, limit = 4): Advice[] {
  const out: Advice[] = [];

  if (i.bestUpgrade && i.bestUpgrade.gain > 0) {
    out.push({
      id: 'upgrade', icon: 'arrowUp', points: Math.round(i.bestUpgrade.gain),
      title: `Upgrade ${i.bestUpgrade.cardName}`,
      detail: `Spend ${i.bestUpgrade.cost} ${i.bestUpgrade.fromLabel} for 1 ${i.bestUpgrade.toLabel}. Your best available upgrade.`,
      href: '#upgrades',
    });
  }

  const left = i.totalCards - i.uniqueCards;
  if (!i.complete && left > 0 && left <= 3) {
    out.push({
      id: 'complete', icon: 'cheese', points: Math.round(i.completeSetBonusValue),
      title: left === 1 ? 'One card from a complete collection' : `${left} cards from a complete collection`,
      detail: `Owning every card earns a bonus of ${Math.round(i.completeSetBonusValue).toLocaleString()} points on top of the cards themselves.`,
      href: '#missing',
    });
  }

  const best = [...i.missing].sort((a, b) => missingGain(b, i) - missingGain(a, i) || a.pullRate - b.pullRate)[0];
  if (best) {
    out.push({
      id: 'missing', icon: 'search', points: missingGain(best, i),
      title: `Find ${best.name}`,
      detail: `The most valuable card you do not have: its points plus a bigger completion bonus. Pull chance ${best.pullRate > 0 ? `1 in ${Math.round(1 / best.pullRate).toLocaleString()}` : 'unknown'}.`,
      href: `/cards?card=${best.number}`,
    });
  }

  if (i.nextRank) {
    out.push({
      id: 'rank', icon: 'trophy', points: i.nextRank.gap,
      title: `Pass @${i.nextRank.username}`,
      detail: `${i.nextRank.gap.toLocaleString()} more point${i.nextRank.gap === 1 ? '' : 's'} moves you up a place.`,
    });
  }

  return out.slice(0, limit);
}
