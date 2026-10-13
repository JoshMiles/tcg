import type { Card, Pack, Season } from './types';

/** A thing that has to be fixed before a draft can be published. `step` says where in the wizard to fix it. */
export interface Issue {
  step: string;
  message: string;
}

type PackFields = Pick<Pack, 'name' | 'upgradesEnabled' | 'variantWeights'>;
type CardFields = Pick<Card, 'name' | 'imageUrl' | 'stars' | 'probability'>;

export function validatePack(pack: PackFields, cards: CardFields[]): Issue[] {
  const issues: Issue[] = [];
  if (!pack.name.trim()) issues.push({ step: 'details', message: 'Give the pack a name.' });

  if (cards.length === 0) {
    issues.push({ step: 'cards', message: 'Add at least one card.' });
  } else {
    const unnamed = cards.filter(c => !c.name.trim()).length;
    const noImage = cards.filter(c => !c.imageUrl).length;
    const noOdds = cards.filter(c => !(c.probability > 0)).length;
    const badStars = cards.filter(c => !(c.stars >= 1 && c.stars <= 5)).length;
    const plural = (n: number) => `${n} card${n === 1 ? '' : 's'}`;
    if (unnamed) issues.push({ step: 'cards', message: `${plural(unnamed)} ${unnamed === 1 ? 'has' : 'have'} no name.` });
    if (noImage) issues.push({ step: 'cards', message: `${plural(noImage)} ${noImage === 1 ? 'has' : 'have'} no image.` });
    if (noOdds) issues.push({ step: 'cards', message: `${plural(noOdds)} ${noOdds === 1 ? 'has' : 'have'} a probability of 0 and could never be pulled.` });
    if (badStars) issues.push({ step: 'cards', message: `${plural(badStars)} ${badStars === 1 ? 'has' : 'have'} a star rating outside 1–5.` });
  }

  if (pack.upgradesEnabled && !(pack.variantWeights.regular > 0)) {
    issues.push({ step: 'upgrades', message: 'The Regular weight must be above 0, or every pull would be a rare variant.' });
  }
  return issues;
}

export function validateSeason(
  season: Pick<Season, 'name' | 'collectionName' | 'packIds'> & Partial<Pick<Season, 'startsAt' | 'endsAt'>>,
  /** Collection names used by *other* seasons, sharing one would merge two seasons' collections. */
  otherCollectionNames: string[],
): Issue[] {
  const issues: Issue[] = [];
  if (!season.name.trim()) issues.push({ step: 'details', message: 'Give the season a name.' });
  const key = season.collectionName.trim();
  if (!key) {
    issues.push({ step: 'details', message: 'Choose a collection name.' });
  } else {
    if (/\s/.test(key)) issues.push({ step: 'details', message: 'The collection name can\'t contain spaces.' });
    if (otherCollectionNames.some(n => n.toLowerCase() === key.toLowerCase())) {
      issues.push({ step: 'details', message: `Another season already uses "${key}", viewers' cards would be shared between them.` });
    }
  }
  if (season.startsAt !== undefined && season.endsAt !== undefined && season.endsAt <= season.startsAt) issues.push({ step: 'details', message: 'The end date must be after the start date.' });
  if (season.packIds.length === 0) issues.push({ step: 'packs', message: 'Attach at least one pack.' });
  return issues;
}

/** Suggests a storage key from a season name: "Season 2: Horror!" -> "Season2Horror". */
export function suggestCollectionName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join('');
}
