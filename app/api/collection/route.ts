import { NextRequest, NextResponse } from 'next/server';
import { getCollection, saveCollection, deleteCollection, addCollectionEntryWithSerial } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { serialMultiplier } from '@/lib/scoring-core';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { decodeEntry, VARIANT_LABELS } from '@/lib/variants';
import { isAuthenticated } from '@/lib/auth';
import { claimDraw } from '@/lib/draw';
import { getMixItUpSettings, claimPaidPull, chargePaidPull, releaseCount, revokePrint, noticeRevoked } from '@/lib/mixitup';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  return NextResponse.json(await getCollection(name));
}

export async function POST(req: NextRequest) {
  const { data, pull } = await req.json().catch(() => ({}));

  // Writing is not open to the world. A pull is saved only against a ticket the server issued when it queued the pull
  // (lib/draw.ts), and what is saved is what the TICKET says: the caller cannot pick the card, the viewer or the collection.
  // Replacing a whole collection (`data`) is an admin tool.
  if (!pull) {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const target = req.nextUrl.searchParams.get('name');
    if (!target || !data || typeof data !== 'object') return NextResponse.json({ error: 'missing name or data' }, { status: 400 });
    await saveCollection(target, data);
    return NextResponse.json({ ok: true });
  }

  const username = String(pull.username ?? '').toLowerCase();
  const ticket = typeof pull.ticket === 'string' && username ? await claimDraw(pull.ticket, username) : null;
  if (!ticket) return NextResponse.json({ ok: false, error: 'This pull is not recognised, or it was already saved.' }, { status: 401 });
  const name = ticket.collectionName;
  const entry = ticket.entry;

  // The overlay's in-memory copy of the collection goes stale whenever something else changes it (an upgrade, a grant, an admin
  // edit), so the pull is appended server-side and the new array is returned for the overlay to resync.
  let owned: number[] = [];
  let serial: number | null = null;
  let copyId: string | null = null;
  let uid: number | null = null;
  let before: Record<string, number[]> | null = null;
  let paid: Awaited<ReturnType<typeof claimPaidPull>> = null;
  {
    // A paid pull (Mix It Up) is claimed first, once, so a repeated save cannot add a second print on one payment.
    if (ticket.paid) {
      paid = await claimPaidPull(String(pull.ticket), username);
      if (!paid) return NextResponse.json({ ok: false, error: 'This paid pull was already used or has expired.' }, { status: 409 });
    }
    before = await getCollection(name);
    ({ owned, serial, copyId, uid } = await addCollectionEntryWithSerial(name, username, entry, 'pull'));
    if (paid) {
      const mix = await getMixItUpSettings();
      const card = decodeEntry(entry);
      const charge = await chargePaidPull(mix, paid, {
        cardName: ticket.cardName, variant: VARIANT_LABELS[card.variant], stars: ticket.stars,
        packName: ticket.packName, cardNumber: card.cardNumber, serial,
      });
      if (!charge.applied) {
        // Mix It Up did not confirm the payment: take the print back and record nothing.
        const left = await revokePrint(name, username, entry, copyId);
        await releaseCount(paid);
        await noticeRevoked(username, ticket.cardName, charge.error ?? 'not applied');
        return NextResponse.json({ ok: true, revoked: true, owned: left ?? owned });
      }
    }
  }

  // The serial the new copy got and what it is worth (the overlay shows it on the reveal).
  const mult = serial ? serialMultiplier(serial, await getScoringSettings()) : 1;

  const { cardNumber, variant } = decodeEntry(entry);
  await recordActivity({
    type: 'pull',
    username,
    collectionName: name,
    cardNumber,
    cardName: ticket.cardName,
    stars: ticket.stars,
    packName: ticket.packName,
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
      username, cardName: ticket.cardName, cardNumber: String(cardNumber), stars: String(ticket.stars), variant, packName: ticket.packName,
    })
  ).catch(() => {});

  return NextResponse.json({ ok: true, owned, serial, uid, serialMult: Math.round(mult * 100) / 100 });
}

// Resetting collections is an admin tool (the overlay's test panel, opened while signed in).
export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
