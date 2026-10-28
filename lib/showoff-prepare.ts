import { kv } from './db';
import { getActiveSeasonWithPacks, getUserCards } from './kv';
import { getSeasonLeaderboardCached } from './leaderboard';
import { getOwnerCopies } from './serials';
import { getUserSettings } from './user-settings-store';
import { serialMultiplier } from './scoring-core';
import { countVariants, VARIANTS, VARIANT_LABELS } from './variants';
import { parseShowQuery, pickShowVariant, resolveCard, type ShowCard } from './showoff';
import type { Variant } from './types';

export const SHOWOFF_COOLDOWN_S = 15;

export interface ShowPlan {
  username: string;
  cardNumber: number;
  cardName: string;
  variant: Variant;
  serial?: number;
  serialMult?: number;
  /** The edition number of that copy. */
  uid?: number;
  /** A sentence a bot can say back in chat. */
  message: string;
}

export type ShowResult = { ok: true; plan: ShowPlan } | { ok: false; error: string; message: string; retryAfter?: number };

/**
 * Works out what to put on stream for "show off my <card>". Everything is checked here, on the server: the card must exist in the
 * running season and the viewer must really own it (in the version asked for), so the overlay can only ever be told to show a genuine
 * card of theirs. One show-off per viewer every few seconds, so a chat cannot flood the screen.
 */
export async function prepareShowOff(username: string, text: unknown, opts: { dry?: boolean; /** Skip the pinned print and showcase: always the highest-value card (the raid shout-out). */ best?: boolean } = {}): Promise<ShowResult> {
  const user = username.toLowerCase();
  const active = await getActiveSeasonWithPacks();
  if (!active) return { ok: false, error: 'no-season', message: 'There is no season running right now.' };
  const { season, packs } = active;

  const owned = countVariants(await getUserCards(season.collectionName, user));
  const cards: ShowCard[] = packs.flatMap(p => p.cards).map(c => ({ number: c.number, name: c.name, stars: c.stars }));
  const board = await getSeasonLeaderboardCached(season).catch(() => null);

  const q = parseShowQuery(text);
  // No card named: the pinned print, else the first showcase pick they still hold, else the best card below.
  let forced: { card: ShowCard; variant: Variant; serial: number; uid: number } | null = null;
  if (q.number === null && !q.name && !opts.best) {
    const [settings, mine] = await Promise.all([
      getUserSettings(user).catch(() => null),
      getOwnerCopies(season.collectionName, user).catch(() => []),
    ]);
    const byUid = (uid: number | null | undefined) => (uid ? mine.find(c => c.uid === uid) : undefined);
    const hit = byUid(settings?.pinned) ?? settings?.showcaseUids.map(byUid).find(c => c);
    const card = hit ? cards.find(c => c.number === hit.card) : undefined;
    if (hit?.uid && card && (owned.get(card.number)?.[hit.variant] ?? 0) > 0) forced = { card, variant: hit.variant, serial: hit.n, uid: hit.uid };
  }
  // "My best card": the copy worth the most points right now (falls back to the rarest owned).
  const best = (): ShowCard | null => {
    let top: { card: ShowCard; value: number } | null = null;
    for (const c of cards) {
      const counts = owned.get(c.number);
      if (!counts) continue;
      const v = board?.values.cards.get(c.number);
      const value = VARIANTS.reduce((m, variant) => (counts[variant] > 0 ? Math.max(m, v?.values[variant] ?? 0) : m), 0) || c.stars;
      if (!top || value > top.value) top = { card: c, value };
    }
    return top?.card ?? null;
  };

  let card: ShowCard;
  let variant: Variant;
  let serial: number | undefined;
  let uid: number | undefined;
  if (forced) {
    card = forced.card; variant = forced.variant; serial = forced.serial; uid = forced.uid;
  } else {
    const resolved = resolveCard(q, cards, new Set(owned.keys()), best);
    if (!resolved.ok) return { ok: false, error: resolved.reason, message: resolved.message };
    card = resolved.card;
    const pick = pickShowVariant(owned.get(card.number)!, q.variant);
    if (!pick.ok) return { ok: false, error: 'not-owned', message: pick.message };
    variant = pick.variant;
    // The viewer's own copy with the lowest serial number, when the season's copies are numbered.
    try {
      const mine = (await getOwnerCopies(season.collectionName, user)).filter(c => c.card === card.number && c.variant === variant);
      if (mine.length > 0) {
        const lowest = mine.reduce((a, c) => (c.n < a.n ? c : a));
        serial = lowest.n;
        uid = lowest.uid;
      }
    } catch { /* no serial shown */ }
  }
  const serialMult = serial && board ? serialMultiplier(serial, board.values.settings) : undefined;

  // Cooldown last, so a refused request (not their card, a typo) does not use up their turn.
  const taken = opts.dry ? 'OK' : await kv.set(`showoff:cd:${user}`, 1, { nx: true, ex: SHOWOFF_COOLDOWN_S }).catch(() => 'OK');
  if (taken === null) return { ok: false, error: 'cooldown', message: `Easy there, try again in a few seconds.`, retryAfter: SHOWOFF_COOLDOWN_S };

  const label = `${variant === 'regular' ? '' : `${VARIANT_LABELS[variant]} `}${card.name}${serial ? ` #${serial}` : ''}`;
  return { ok: true, plan: { username: user, cardNumber: card.number, cardName: card.name, variant, serial, serialMult, uid, message: `Showing off your ${label}!` } };
}
