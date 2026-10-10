import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { getActiveSeason, addCollectionEntry } from '@/lib/kv';
import { recordActivity } from '@/lib/activity';
import { VARIANTS, encodeEntry } from '@/lib/variants';
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

  await addCollectionEntry(season.collectionName, username, encodeEntry(num, variant));
  await recordActivity({ type: 'grant', source: 'webhook', username, cardNumber: num, variant, collectionName: season.collectionName });

  return NextResponse.json({ ok: true, username, cardNumber: num, variant });
}
