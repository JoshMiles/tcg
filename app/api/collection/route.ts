import { NextRequest, NextResponse, after } from 'next/server';
import { inSandbox } from '@/lib/db';
import { getCollection, saveCollection, deleteCollection, addCollectionEntryWithSerial, listSeasons, removeUserFromCollection, withCollectionLock } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { serialMultiplier } from '@/lib/scoring-core';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { decodeEntry, VARIANT_LABELS } from '@/lib/variants';
import { isAuthenticated } from '@/lib/auth';
import { claimDraw } from '@/lib/draw';
import { getMixItUpSettings, claimPaidPull, chargePaidPull, noticeUnpaid, refundPaidPull } from '@/lib/mixitup';
import { isOverlayRequest } from '@/lib/overlay-key';
import { consumePullOnSave } from '@/lib/buffs';

const NO_STORE = { 'Cache-Control': 'no-store' };

// The overlay (OBS, with the overlay key) and a signed-in staff session. Not a public dump: the body is every
// viewer's pulls, including private profiles, which the on-stream collection needs.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400, headers: NO_STORE });
  if (!(await isOverlayRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  return NextResponse.json(await getCollection(name), { headers: NO_STORE });
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
    await withCollectionLock(target, () => saveCollection(target, data));
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
  const mix = ticket.paid ? await getMixItUpSettings() : null;
  {
    // A paid pull (Mix It Up) is claimed first, once, so a repeated save cannot add a second print on one payment.
    if (ticket.paid) {
      paid = await claimPaidPull(String(pull.ticket), username);
      if (!paid) return NextResponse.json({ ok: false, error: 'This paid pull was already used or has expired.' }, { status: 409 });
    }
    before = await getCollection(name);
    // The charge comes before the print, so a print never exists without its payment: no confirmation = nothing is saved.
    // The edition number does not exist yet, so the deduct message gets none.
    if (paid && mix) {
      const card = decodeEntry(entry);
      const charge = await chargePaidPull(mix, paid, {
        cardName: ticket.cardName, variant: VARIANT_LABELS[card.variant], stars: ticket.stars,
        packName: ticket.packName, cardNumber: card.cardNumber, serial: null,
      });
      if (!charge.applied) {
        await noticeUnpaid(paid, ticket.cardName, charge.error ?? 'not applied');
        return NextResponse.json({ ok: true, revoked: true, owned: before[username] ?? [] });
      }
    }
    try {
      ({ owned, serial, copyId, uid } = await addCollectionEntryWithSerial(name, username, entry, 'pull'));
    } catch (e) {
      // Charged but the print could not be saved: pay it back rather than keep the money for nothing.
      if (paid && mix) await refundPaidPull(mix, paid, ticket.cardName).catch(() => {});
      throw e;
    }
  }

  // Buffs store the season's id, which is not the collection name the ticket carries.
  const seasonId = (await listSeasons().catch(() => [])).find(s => s.collectionName === name)?.id;
  await consumePullOnSave(username, { wasCredit: paid?.credit, seasonId }).catch(() => {});

  // The serial the new copy got and what it is worth (the overlay shows it on the reveal).
  const mult = serial ? serialMultiplier(serial, await getScoringSettings()) : 1;

  const { cardNumber, variant } = decodeEntry(entry);
  // What this pull meant for the viewer (the overlay's special moments use these).
  const isNew = !before?.[username]?.some(e => decodeEntry(e).cardNumber === cardNumber);
  const firstForViewer = !before?.[username]?.length;
  await recordActivity({
    type: 'pull',
    username,
    collectionName: name,
    cardNumber,
    cardName: ticket.cardName,
    stars: ticket.stars,
    packName: ticket.packName,
    variant,
    isNew,
    copies: owned.filter(e => decodeEntry(e).cardNumber === cardNumber).length,
    uniqueOwned: new Set(owned.map(e => decodeEntry(e).cardNumber)).size,
    ...(serial ? { serial, ...(mult > 1 ? { bonus: Math.round(mult * 100) / 100 } : {}) } : {}),
    ...(copyId ? { copyId } : {}),
    ...(uid ? { uid } : {}),
  });

  // Sent after the response, held open by after() so the function isn't frozen before it goes out. The sandbox is decided
  // now (it is not visible inside after()). Outside a request (scripts) it just runs.
  if (!(await inSandbox())) {
    const send = async () => {
      const settings = await getWebhookSettings();
      await fireOutgoing(settings.outgoing.cardPulled, {
        username, cardName: ticket.cardName, cardNumber: String(cardNumber), stars: String(ticket.stars), variant, packName: ticket.packName,
      });
    };
    try { after(() => send().catch(() => {})); } catch { await send().catch(() => {}); }
  }

  return NextResponse.json({ ok: true, owned, serial, uid, serialMult: Math.round(mult * 100) / 100, isNew, firstForViewer });
}

// Resetting collections is an admin tool (the overlay's test panel, opened while signed in).
export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const name = searchParams.get('name');
  const username = searchParams.get('username');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });

  if (username) {
    await removeUserFromCollection(name, username);
    await recordActivity({ type: 'reset', scope: 'season', username, collectionName: name });
  } else {
    await deleteCollection(name);
    await recordActivity({ type: 'reset', scope: 'everyone', username: '', collectionName: name });
  }
  return NextResponse.json({ ok: true });
}
