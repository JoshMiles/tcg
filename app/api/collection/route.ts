import { NextRequest, NextResponse } from 'next/server';
import { getCollection, saveCollection, deleteCollection, addCollectionEntryWithSerial } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { serialMultiplier } from '@/lib/scoring-core';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { decodeEntry, VARIANT_LABELS } from '@/lib/variants';
import { getMixItUpSettings, claimPaidPull, chargePaidPull, releaseCount, revokePrint, noticeRevoked } from '@/lib/mixitup';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  return NextResponse.json(await getCollection(name));
}

export async function POST(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  const { data, pull } = await req.json();

  // A reported pull is appended server-side. The overlay's in-memory copy of the collection goes stale
  // whenever something else changes it (an upgrade, a grant, an admin edit), and overwriting with it
  // would silently undo that. The new array is returned so the overlay can resync.
  let owned: number[] = [];
  let serial: number | null = null;
  let copyId: string | null = null;
  let uid: number | null = null;
  let before: Record<string, number[]> | null = null;
  let paid: Awaited<ReturnType<typeof claimPaidPull>> = null;
  if (pull) {
    const username = String(pull.username ?? '').toLowerCase();
    const entry = Number(pull.entry ?? pull.cardNumber);
    if (!username || !Number.isInteger(entry) || entry < 1) {
      return NextResponse.json({ error: 'invalid pull' }, { status: 400 });
    }
    // A paid pull (Mix It Up) is claimed first, once, so a repeated save cannot add a second print on one payment.
    if (pull.payId) {
      paid = await claimPaidPull(String(pull.payId), username);
      if (!paid) return NextResponse.json({ ok: false, error: 'This paid pull was already used or has expired.' }, { status: 409 });
    }
    before = await getCollection(name);
    ({ owned, serial, copyId, uid } = await addCollectionEntryWithSerial(name, username, entry, 'pull'));
    if (paid) {
      const mix = await getMixItUpSettings();
      const card = decodeEntry(entry);
      const charge = await chargePaidPull(mix, paid, {
        cardName: String(pull.cardName ?? '').slice(0, 80), variant: VARIANT_LABELS[card.variant], stars: Number(pull.stars) || 0,
        packName: String(pull.packName ?? '').slice(0, 80), cardNumber: card.cardNumber, serial,
      });
      if (!charge.applied) {
        // Mix It Up did not confirm the payment: take the print back and record nothing.
        const left = await revokePrint(name, username, entry, copyId);
        await releaseCount(paid);
        await noticeRevoked(username, String(pull.cardName ?? 'a card'), charge.error ?? 'not applied');
        return NextResponse.json({ ok: true, revoked: true, owned: left ?? owned });
      }
    }
  } else {
    await saveCollection(name, data);
  }

  // The serial the new copy got and what it is worth (the overlay shows it on the reveal).
  const mult = serial ? serialMultiplier(serial, await getScoringSettings()) : 1;

  if (pull) {
    const username = String(pull.username ?? '').toLowerCase();
    const cardNumber = Number(pull.cardNumber);
    const variant = decodeEntry(Number(pull.entry ?? cardNumber)).variant;
    await recordActivity({
      type: 'pull',
      username,
      collectionName: name,
      cardNumber,
      cardName: String(pull.cardName ?? '').slice(0, 80),
      stars: Number(pull.stars) || 0,
      packName: String(pull.packName ?? '').slice(0, 80),
      variant,
      isNew: !before?.[username]?.some(e => decodeEntry(e).cardNumber === cardNumber),
      copies: owned.filter(e => decodeEntry(e).cardNumber === cardNumber).length,
      uniqueOwned: new Set(owned.map(e => decodeEntry(e).cardNumber)).size,
      ...(serial ? { serial, ...(mult > 1 ? { bonus: Math.round(mult * 100) / 100 } : {}) } : {}),
      ...(copyId ? { copyId } : {}),
      ...(uid ? { uid } : {}),
    });

    getWebhookSettings().then(settings =>
      fireOutgoing(settings.outgoing.cardPulled, {
        username:   String(pull.username   ?? ''),
        cardName:   String(pull.cardName   ?? ''),
        cardNumber: String(pull.cardNumber ?? ''),
        stars:      String(pull.stars      ?? ''),
        variant,
        packName:   String(pull.packName   ?? ''),
      })
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, owned, serial, uid, serialMult: Math.round(mult * 100) / 100 });
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
