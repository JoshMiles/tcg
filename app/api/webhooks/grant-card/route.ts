import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { getActiveSeason, getPacksForSeason, getPackCards, addCollectionEntryWithSerial } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { serialMultiplier } from '@/lib/scoring-core';
import { recordActivity } from '@/lib/activity';
import { VARIANTS, decodeEntry, encodeEntry } from '@/lib/variants';
import type { Card, Variant } from '@/lib/types';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;
  const { username, body } = parsed;

  const num = Number(body.cardNumber);
  if (!Number.isInteger(num) || num < 1) {
    return NextResponse.json({ error: 'cardNumber must be a positive integer' }, { status: 400 });
  }

  // Optional: which variant to grant. Defaults to regular.
  const variant = String(body.variant ?? 'regular').toLowerCase() as Variant;
  if (!VARIANTS.includes(variant)) {
    return NextResponse.json({ error: `variant must be one of: ${VARIANTS.join(', ')}` }, { status: 400 });
  }

  const season = await getActiveSeason();
  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 });
  }

  // Only a card of the active season's published packs can be granted (the same pool the season stats count).
  let card: (Card & { packName: string }) | undefined;
  for (const p of (await getPacksForSeason(season)).filter(p => p.status === 'published')) {
    const found = (await getPackCards(p.id)).find(c => c.number === num);
    if (found) { card = { ...found, packName: p.name }; break; }
  }
  if (!card) return NextResponse.json({ error: `No card number ${num} in the active season` }, { status: 404 });

  const made = await addCollectionEntryWithSerial(season.collectionName, username, encodeEntry(num, variant), 'grant');
  // Recorded with the same facts as a pull (name, stars, pack, new or not, how many, edition) so the live feed and Discord show it like one.
  const copies = made.owned.filter(e => decodeEntry(e).cardNumber === num).length;
  const mult = made.serial ? serialMultiplier(made.serial, await getScoringSettings()) : 1;
  await recordActivity({
    type: 'grant', source: 'webhook', username, cardNumber: num, variant, collectionName: season.collectionName,
    cardName: card.name, stars: card.stars, packName: card.packName,
    isNew: copies <= 1, copies, uniqueOwned: new Set(made.owned.map(e => decodeEntry(e).cardNumber)).size,
    ...(made.serial ? { serial: made.serial, ...(mult > 1 ? { bonus: Math.round(mult * 100) / 100 } : {}) } : {}),
    ...(made.copyId ? { copyId: made.copyId } : {}), ...(made.uid ? { uid: made.uid } : {}),
  });

  return NextResponse.json({ ok: true, username, cardNumber: num, variant });
}
