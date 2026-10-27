import type { Card, Pack, Season } from './types';
import { packHealth } from './pack-health';

// Pre-flight check before a season goes live (ROADMAP 51.12). A check, not a gate: it never blocks activation. Errors are the things
// that would break pulls (nothing to draw, or every card or variant at 0 odds); warnings are the rest; notes are things worth a look that
// cannot go wrong (a gap in a pack's star lineup). Items link to where to fix them.

export interface PreflightItem {
  level: 'error' | 'warning' | 'note';
  message: string;
  href?: string;
}

// Pack-health ids reused here (the same checks the pack page shows). There is no per-card frame field (the overlay draws the frame),
// so there is no "missing frame" rule. Card odds and variant weights are relative, so "odds don't add up" means a total of 0.
const KEPT = new Set(['no-image', 'no-odds', 'no-full-art', 'regular-weight']);

/** Pure: what is wrong with a season's live packs before it is made the live one. Errors come first, notes last. */
export function seasonPreflight(season: Season, packs: Pack[], cardsOf: (packId: string) => Card[]): PreflightItem[] {
  const items: PreflightItem[] = [];
  const seasonHref = `/admin/seasons/${season.id}`;
  const live = packs.filter(p => p.status === 'published' && p.active);
  if (packs.length === 0) items.push({ level: 'error', message: 'This season has no packs, so nothing could be drawn.', href: seasonHref });
  else if (live.length === 0) items.push({ level: 'error', message: 'None of its packs are published and active, so nothing could be drawn.', href: seasonHref });
  for (const p of live) {
    const cards = cardsOf(p.id);
    const href = `/admin/packs/${p.id}`;
    if (cards.length === 0) { items.push({ level: 'error', message: `${p.name} has no cards.`, href }); continue; }
    const allZero = cards.every(c => !(c.probability > 0));
    if (allZero) items.push({ level: 'error', message: `${p.name}: every card has 0 odds, so nothing can be pulled.`, href });
    for (const h of packHealth(p, cards, { inSeason: true })) {
      if (KEPT.has(h.id) && !(allZero && h.id === 'no-odds')) items.push({ level: 'warning', message: `${p.name}: ${h.text}`, href: h.href ?? href });
    }
    if (p.upgradesEnabled && !Object.values(p.variantWeights).some(w => w > 0)) items.push({ level: 'error', message: `${p.name}: every variant weight is 0, so no version can be rolled.`, href });
    // A rarity tier (stars) below the pack's top one with no cards: a gap in the lineup. Only a note: a tier's chance is its cards' odds, so an empty tier is never pulled.
    const top = Math.max(...cards.map(c => c.stars));
    const missing = Array.from({ length: Math.max(0, top - 1) }, (_, i) => i + 1).filter(s => !cards.some(c => c.stars === s));
    if (missing.length > 0) items.push({ level: 'note', message: `${p.name}: no cards in the ${missing.join(', ')}-star tier${missing.length === 1 ? '' : 's'}.`, href });
  }
  if (season.endsAt !== undefined && season.endsAt <= Date.now()) items.push({ level: 'warning', message: 'Its end date has already passed, so it would be wrapped up again straight away.', href: seasonHref });
  return (['error', 'warning', 'note'] as const).flatMap(l => items.filter(i => i.level === l));
}
