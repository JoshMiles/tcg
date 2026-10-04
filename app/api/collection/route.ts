import { NextRequest, NextResponse } from 'next/server';
import { getCollection, saveCollection, deleteCollection } from '@/lib/kv';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  return NextResponse.json(await getCollection(name));
}

export async function POST(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  const { data, pull } = await req.json();
  // Only draws need the previous state (to tell a new card from a duplicate).
  const before = pull ? await getCollection(name) : null;
  await saveCollection(name, data);

  if (pull) {
    const username = String(pull.username ?? '').toLowerCase();
    const cardNumber = Number(pull.cardNumber);
    const owned: number[] = Array.isArray(data?.[username]) ? data[username] : [];
    await recordActivity({
      type: 'pull',
      username,
      collectionName: name,
      cardNumber,
      cardName: String(pull.cardName ?? '').slice(0, 80),
      stars: Number(pull.stars) || 0,
      packName: String(pull.packName ?? '').slice(0, 80),
      isNew: !before?.[username]?.includes(cardNumber),
      copies: owned.filter(n => n === cardNumber).length,
      uniqueOwned: new Set(owned).size,
    });

    getWebhookSettings().then(settings =>
      fireOutgoing(settings.outgoing.cardPulled, {
        username:   String(pull.username   ?? ''),
        cardName:   String(pull.cardName   ?? ''),
        cardNumber: String(pull.cardNumber ?? ''),
        stars:      String(pull.stars      ?? ''),
        packName:   String(pull.packName   ?? ''),
      })
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get('name');
  const username = searchParams.get('username');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });

  if (username) {
    const data = await getCollection(name);
    delete data[username.toLowerCase()];
    await saveCollection(name, data);
    await recordActivity({ type: 'reset', scope: 'season', username, collectionName: name });
  } else {
    await deleteCollection(name);
    await recordActivity({ type: 'reset', scope: 'everyone', username: '', collectionName: name });
  }
  return NextResponse.json({ ok: true });
}
