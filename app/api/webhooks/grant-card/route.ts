import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { getActiveSeason, getCollection, saveCollection } from '@/lib/kv';
import { recordActivity } from '@/lib/activity';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;
  const { username, body } = parsed;

  const num = Number(body.cardNumber);
  if (!Number.isInteger(num) || num < 1) {
    return NextResponse.json({ error: 'cardNumber must be a positive integer' }, { status: 400 });
  }

  const season = await getActiveSeason();
  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 });
  }

  const collection = await getCollection(season.collectionName);
  collection[username] = [...(collection[username] ?? []), num];
  await saveCollection(season.collectionName, collection);
  await recordActivity({ type: 'grant', source: 'webhook', username, cardNumber: num, collectionName: season.collectionName });

  return NextResponse.json({ ok: true, username, cardNumber: num });
}
