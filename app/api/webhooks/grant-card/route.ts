import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { getActiveSeason, getActiveSeasonWithPacks, addCollectionEntryWithSerial } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { serialMultiplier } from '@/lib/scoring-core';
import { recordActivity } from '@/lib/activity';
import { VARIANTS, decodeEntry, encodeEntry } from '@/lib/variants';
import type { Variant } from '@/lib/types';

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

  const made = await addCollectionEntryWithSerial(season.collectionName, username, encodeEntry(num, variant), 'grant');
  // Recorded with the same facts as a pull (name, stars, pack, new or not, how many, edition) so the live feed and Discord show it like one.
  const card = (await getActiveSeasonWithPacks().catch(() => null))?.packs.flatMap(p => p.cards.map(c => ({ ...c, packName: p.pack.name }))).find(c => c.number === num);
  const copies = made.owned.filter(e => decodeEntry(e).cardNumber === num).length;
  const mult = made.serial ? serialMultiplier(made.serial, await getScoringSettings()) : 1;
  await recordActivity({
    type: 'grant', source: 'webhook', username, cardNumber: num, variant, collectionName: season.collectionName,
    ...(card ? { cardName: card.name, stars: card.stars, packName: card.packName } : {}),
    isNew: copies <= 1, copies, uniqueOwned: new Set(made.owned.map(e => decodeEntry(e).cardNumber)).size,
    ...(made.serial ? { serial: made.serial, ...(mult > 1 ? { bonus: Math.round(mult * 100) / 100 } : {}) } : {}),
    ...(made.copyId ? { copyId: made.copyId } : {}), ...(made.uid ? { uid: made.uid } : {}),
  });

  return NextResponse.json({ ok: true, username, cardNumber: num, variant });
}
