// Server-side pulls (ROADMAP Track 13). The server rolls what a queued pull will be, stores it as a one-use ticket, and the overlay
// only plays it and reports back with the ticket id. `/api/collection` then saves what the TICKET says, never what the caller says,
// so nobody who finds that URL can write cards. The odds are the ones the overlay always used: a pack by its weight, a card by its
// probability, then (where the pack and card have variants on) a version by the pack's weights.
import { kv } from './db';
import { getActiveSeasonWithPacks } from './kv';
import { DEFAULT_VARIANT_WEIGHTS, VARIANTS, encodeEntry } from './variants';
import type { Card, Pack, Variant } from './types';

const TICKET_TTL_S = 12 * 3600; // an overlay that is offline plays queued pulls when it comes back, so be generous
const ticketKey = (id: string) => `draw:${id}`;

export interface DrawResult { pack: Pack; card: Card; variant: Variant }

/** Rolls one pull from the given packs. Pure apart from `rng` (so a script can test the odds). Null when there is nothing to draw. */
export function rollDraw(packs: { pack: Pack; cards: Card[] }[], rng: () => number = Math.random): DrawResult | null {
  const usable = packs.filter(p => p.cards.length > 0);
  if (usable.length === 0) return null;
  const totalWeight = usable.reduce((s, { pack }) => s + (pack.weight || 1), 0);
  let rw = rng() * totalWeight;
  let chosen = usable[usable.length - 1];
  for (const p of usable) { rw -= p.pack.weight || 1; if (rw <= 0) { chosen = p; break; } }

  const totalProb = chosen.cards.reduce((s, c) => s + c.probability, 0);
  let rp = rng() * totalProb;
  let card = chosen.cards[chosen.cards.length - 1];
  for (const c of chosen.cards) { rp -= c.probability; if (rp <= 0) { card = c; break; } }

  let variant: Variant = 'regular';
  if (chosen.pack.upgradesEnabled && card.kind !== 'trainer' && card.upgradesEnabled !== false) {
    const w = { ...DEFAULT_VARIANT_WEIGHTS, ...chosen.pack.variantWeights };
    const off = [...(chosen.pack.disabledVariants ?? []), ...(card.disabledVariants ?? [])] as Variant[];
    const weight = (v: Variant) => (v !== 'regular' && off.includes(v) ? 0 : Math.max(0, w[v]));
    const total = VARIANTS.reduce((s, v) => s + weight(v), 0);
    if (total > 0) {
      let r = rng() * total;
      for (const v of VARIANTS) { r -= weight(v); if (r < 0) { variant = v; break; } }
    }
  }
  return { pack: chosen.pack, card, variant };
}

export interface DrawTicket {
  username: string;
  collectionName: string;
  packId: string;
  packName: string;
  cardNumber: number;
  cardName: string;
  stars: number;
  variant: Variant;
  /** The collection entry to add (card + version, see lib/variants.ts). */
  entry: number;
  /** A Mix It Up payment was reserved under the same id (lib/mixitup.ts). */
  paid: boolean;
}

/** What the overlay needs to play the pull. */
export interface QueuedDraw { packId: string; cardNumber: number; variant: Variant }

/** Rolls a pull for a viewer and stores its ticket under `id`. Null when the active season has nothing to draw. */
export async function issueDraw(id: string, username: string, paid = false): Promise<QueuedDraw | null> {
  const active = await getActiveSeasonWithPacks();
  const rolled = active ? rollDraw(active.packs) : null;
  if (!active || !rolled) return null;
  const { pack, card, variant } = rolled;
  const ticket: DrawTicket = {
    username: username.toLowerCase(), collectionName: active.season.collectionName, packId: pack.id, packName: pack.name,
    cardNumber: card.number, cardName: card.name, stars: card.stars, variant, entry: encodeEntry(card.number, variant), paid,
  };
  await kv.set(ticketKey(id), ticket, { ex: TICKET_TTL_S });
  return { packId: pack.id, cardNumber: card.number, variant };
}

/** Takes a ticket, once. Null = unknown, expired, already used or for another viewer (nothing is saved then). */
export async function claimDraw(id: string, username: string): Promise<DrawTicket | null> {
  const t = await kv.get<DrawTicket>(ticketKey(id));
  if (!t || t.username !== username.toLowerCase()) return null;
  return (await kv.del(ticketKey(id))) === 1 ? t : null;
}

/** Throws a ticket away (a pull that was never queued). */
export async function dropDraw(id: string): Promise<void> {
  await kv.del(ticketKey(id)).catch(() => {});
}
