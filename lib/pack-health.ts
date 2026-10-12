import type { Card, Pack } from './types';
import { allowedVariants } from './variants';

// Client-safe checks that say what is wrong or incomplete about a pack, shown as a badge on every pack tile and as a list on the
// pack page. Each issue names what to do and where (a link into the right editor).

export interface HealthIssue {
  id: string;
  level: 'warn' | 'info';
  text: string;
  /** Where to fix it. */
  href?: string;
}

export function packHealth(pack: Pack, cards: Card[], opts: { inSeason: boolean }): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const base = `/admin/packs/${pack.id}`;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  if (cards.length === 0) {
    issues.push({ id: 'no-cards', level: 'warn', text: 'No cards yet, so nothing can be drawn.', href: `${base}/cards` });
    return issues;
  }
  const noOdds = cards.filter(c => !(c.probability > 0));
  if (noOdds.length > 0) issues.push({ id: 'no-odds', level: 'warn', text: `${noOdds.length} ${plural(noOdds.length, 'card has', 'cards have')} 0 odds and can never be pulled.`, href: base });
  const noImage = cards.filter(c => !c.imageUrl);
  if (noImage.length > 0) issues.push({ id: 'no-image', level: 'warn', text: `${noImage.length} ${plural(noImage.length, 'card has', 'cards have')} no image.`, href: `${base}/cards` });
  const unnamed = cards.filter(c => !c.name.trim());
  if (unnamed.length > 0) issues.push({ id: 'unnamed', level: 'warn', text: `${unnamed.length} ${plural(unnamed.length, 'card has', 'cards have')} no name.`, href: `${base}/cards` });

  const numbers = new Map<number, number>();
  for (const c of cards) numbers.set(c.number, (numbers.get(c.number) ?? 0) + 1);
  const dupNumbers = [...numbers.entries()].filter(([, n]) => n > 1);
  if (dupNumbers.length > 0) issues.push({ id: 'dup-numbers', level: 'warn', text: `Card number${dupNumbers.length === 1 ? '' : 's'} used twice: ${dupNumbers.map(([n]) => `#${n}`).join(', ')}. Viewer collections point at numbers, so they must be unique.`, href: base });

  if (pack.upgradesEnabled) {
    const noFullArt = cards.filter(c => !c.fullArtImageUrl && allowedVariants(pack, c).includes('full'));
    if (noFullArt.length > 0) issues.push({ id: 'no-full-art', level: 'warn', text: `${noFullArt.length} ${plural(noFullArt.length, 'card can', 'cards can')} be pulled as Full Art / Shiny but ${plural(noFullArt.length, 'has', 'have')} no full-art image.`, href: base });
    if (!(pack.variantWeights.regular > 0)) issues.push({ id: 'regular-weight', level: 'warn', text: 'The Regular weight is 0, so every pull would be a rare variant.', href: base });
  }

  const names = new Map<string, number>();
  for (const c of cards) { const k = c.name.trim().toLowerCase(); if (k) names.set(k, (names.get(k) ?? 0) + 1); }
  const dupNames = [...names.entries()].filter(([, n]) => n > 1);
  if (dupNames.length > 0) issues.push({ id: 'dup-names', level: 'info', text: `${dupNames.length} card ${plural(dupNames.length, 'name is', 'names are')} used more than once.`, href: base });
  if (!pack.coverImageUrl) issues.push({ id: 'no-cover', level: 'info', text: 'No cover image.', href: `${base}?tab=settings` });
  if (pack.status === 'published' && !opts.inSeason) issues.push({ id: 'no-season', level: 'warn', text: 'Not in any season, so it is never drawn.', href: '/admin/seasons' });
  return issues;
}
