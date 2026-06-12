import { NextRequest, NextResponse } from 'next/server';
import { getWebhookSettings } from '@/lib/webhooks';
import { getActiveSeason, getCollection, saveCollection } from '@/lib/kv';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, cardNumber, secret } = body as {
    username?: string;
    cardNumber?: unknown;
    secret?: string;
  };

  const settings = await getWebhookSettings();
  if (!secret || secret !== settings.incomingSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const user = username?.toLowerCase().trim();
  if (!user) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const num = Number(cardNumber);
  if (!Number.isInteger(num) || num < 1) {
    return NextResponse.json({ error: 'cardNumber must be a positive integer' }, { status: 400 });
  }

  const season = await getActiveSeason();
  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 });
  }

  const collection = await getCollection(season.collectionName);
  const current = collection[user] ?? [];
  collection[user] = [...current, num];
  await saveCollection(season.collectionName, collection);

  return NextResponse.json({ ok: true, username: user, cardNumber: num });
}
