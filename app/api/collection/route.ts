import { recordStreamPull } from '@/lib/stream-streak';
import { countPackGoalPull } from '@/lib/pack-goal';
import { NextRequest, NextResponse, after } from 'next/server';
import { inSandbox } from '@/lib/db';
import { getCollection, saveCollection, deleteCollection, addCollectionEntryWithSerial, listSeasons, removeUserFromCollection, withCollectionLock } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { serialMultiplier } from '@/lib/scoring-core';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { decodeEntry, parseCollectionData, VARIANT_LABELS } from '@/lib/variants';
import { isAuthenticated } from '@/lib/auth';
import { claimDraw } from '@/lib/draw';
import { revealDelay } from '@/lib/pull-rules-core';
import { getMixItUpSettings, claimPaidPull, chargePaidPull, noticeUnpaid, refundPaidPull, firePullRules } from '@/lib/mixitup';
import { isOverlayRequest } from '@/lib/overlay-key';
import { isPreviewRequest } from '@/lib/overlay-preview';
import { consumePullOnSave } from '@/lib/buffs';
import { testCollectionName } from '@/lib/mixitup-test-core';
import { noteMade, traceStep } from '@/lib/mixitup-trace';

const NO_STORE = { 'Cache-Control': 'no-store' };

// The overlay (OBS, with the overlay key) and a signed-in staff session. Not a public dump: the body is every
// viewer's pulls, including private profiles, which the on-stream collection needs.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400, headers: NO_STORE });
  // The staff preview window (57.10) may read, never write: POST below has no preview path.
  if (!(await isOverlayRequest(req)) && !(await isPreviewRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  return NextResponse.json(await getCollection(name), { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const { data, pull, revealInMs } = await req.json().catch(() => ({}));

  // Writing is not open to the world. A pull is saved only against a ticket the server issued when it queued the pull
  // (lib/draw.ts), and what is saved is what the TICKET says: the caller cannot pick the card, the viewer or the collection.
  // Replacing a whole collection (`data`) is an admin tool.
  if (!pull) {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const target = req.nextUrl.searchParams.get('name');
    if (!target) return NextResponse.json({ error: 'missing name' }, { status: 400 });
    const checked = parseCollectionData(data);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    await withCollectionLock(target, () => saveCollection(target, checked.data));
    return NextResponse.json({ ok: true });
  }

  // Only the viewer and the ticket are read from a pull; anything else the caller sends is ignored.
  const username = typeof pull.username === 'string' ? pull.username.toLowerCase() : '';
  const ticketId = typeof pull.ticket === 'string' ? pull.ticket : '';
  const ticket = ticketId && username ? await claimDraw(ticketId, username) : null;
  if (!ticket) return NextResponse.json({ ok: false, error: 'This pull is not recognised, or it was already saved.' }, { status: 401 });
  const name = ticket.collectionName;
  const entry = ticket.entry;
  // A simulated pull (ROADMAP 55.14) is saved to the test collection beside the season's, so no reader of the season sees it, and counts nowhere.
  const test = !!ticket.test;
  const store = test ? testCollectionName(name) : name;
  const step = (s: Parameters<typeof traceStep>[1], state: Parameters<typeof traceStep>[2], detail?: string) => traceStep(test ? ticket.trace : undefined, s, state, detail);
  await step('shown', 'ok', 'The overlay claimed the ticket and started the reveal');

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
      paid = await claimPaidPull(ticketId, username);
      if (!paid) { await step('charged', 'failed', 'The payment reservation was already used or had expired.'); return NextResponse.json({ ok: false, error: 'This paid pull was already used or has expired.' }, { status: 409 }); }
    }
    before = await getCollection(store);
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
        await step('charged', 'failed', `Mix It Up did not confirm the payment (${charge.error ?? 'not applied'}), so nothing was saved.`);
        return NextResponse.json({ ok: true, revoked: true, owned: before[username] ?? [] });
      }
      await step('charged', 'ok', paid.amount > 0 ? `${paid.amount} ${mix.currency} taken through ${mix.connection === 'bridge' ? 'TCG Bridge' : 'Mix It Up'}` : 'An extra-pack credit paid for it: nothing taken');
    } else {
      await step('charged', 'skipped', 'Free pull: nothing charged');
    }
    try {
      ({ owned, serial, copyId, uid } = await addCollectionEntryWithSerial(store, username, entry, 'pull'));
    } catch (e) {
      await step('saved', 'failed', e instanceof Error ? e.message : 'The edition could not be saved.');
      // Charged but the print could not be saved: pay it back rather than keep the money for nothing.
      if (paid && mix) await refundPaidPull(mix, paid, ticket.cardName).catch(() => {});
      throw e;
    }
  }

  // Buffs store the season's id, which is not the collection name the ticket carries.
  if (test && ticket.trace) {
    await noteMade(ticket.trace, { username, collectionName: store, entry, cardName: ticket.cardName, paid: !!paid, amount: paid?.credit ? 0 : paid?.amount ?? 0, at: Date.now() });
  }
  await step('saved', 'ok', `${ticket.cardName} (${VARIANT_LABELS[decodeEntry(entry).variant]}) went into ${username}'s test collection`);

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
    ...(test ? { test: true as const } : {}),
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
  if (!test) { await recordStreamPull(username); await countPackGoalPull(); } // the community pack goal (57.5): real pulls only

  // Sent after the response, held open by after() so the function isn't frozen before it goes out. The sandbox is decided
  // now (it is not visible inside after()). Outside a request (scripts) it just runs. The pull rules (Mix It Up commands on big pulls,
  // ROADMAP 55.6d) go here too: the overlay saves a pull as it reveals it, so this is the reveal, and the save never waits on them.
  const sandbox = await inSandbox();
  const eventId = crypto.randomUUID(); // the overlay sends it back when it reveals this pull (OBS actions of a rule, ROADMAP 55.8)
  // The last two steps of a test pull. The payment message is posted by Mix It Up together with the charge, so that is all "chat reply sent" can mean here.
  const endTest = async () => {
    if (!test) return;
    if (sandbox) await step('rules', 'skipped', 'A sandbox queues no commands');
    const charged = !!paid && !paid.credit && paid.amount > 0;
    await step('chat', charged ? 'ok' : 'skipped', charged ? 'The payment message went to chat with the charge' : 'Free pull: there is no payment message');
  };
  if (!sandbox) {
    const send = async () => {
      await Promise.allSettled([
        // The outgoing cardPulled webhook (it may post to Discord or chat) is for real pulls only.
        test ? Promise.resolve() : getWebhookSettings().then(settings => fireOutgoing(settings.outgoing.cardPulled, {
          username, cardName: ticket.cardName, cardNumber: String(cardNumber), stars: String(ticket.stars), variant, packName: ticket.packName,
        }, 'cardPulled')),
        firePullRules({ username, cardName: ticket.cardName, stars: ticket.stars, variant, isNew, serial: serial || undefined, imageUrl: ticket.imageUrl }, revealDelay(revealInMs), eventId)
          .then(queued => step('rules', queued ? 'ok' : 'skipped', queued ? 'A Mix It Up command was queued for TCG Bridge' : 'No rule matched, or no bridge is paired')),
      ]);
      await endTest();
    };
    try { after(() => send().catch(() => {})); } catch { await send().catch(() => {}); }
  } else await endTest();

  return NextResponse.json({ ok: true, owned, serial, uid, serialMult: Math.round(mult * 100) / 100, isNew, firstForViewer, eventId });
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
