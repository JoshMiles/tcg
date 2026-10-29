// What the dashboard's quick actions do (gift packs, show a collection, grant a card), as plain functions with checked arguments. The server
// actions in app/admin/actions/users.ts and TCG Bridge's Staff tab (lib/bridge-staff.ts, ROADMAP 55.12) both call these, so the two cannot differ.
// The caller has already checked who may ask (requireAdmin, or bridgeStaffGuard) and cleaned the username.
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/app/admin/action-types';
import { recordActivity } from './activity';
import { issueDraw } from './draw';
import { addCollectionEntryWithSerial, ensureUserProfile, getActiveSeasonWithPacks } from './kv';
import { getOverlayStatus } from './overlay';
import { blockedRefusal } from './pull-block';
import { prepareShowOff } from './showoff-prepare';
import type { Variant } from './types';
import { VARIANT_LABELS, encodeEntry } from './variants';
import { enqueueEvent } from './webhooks';

/** Queues overlay events (the overlay polls the queue every 2s and plays them on stream). `force` queues even when no overlay is connected. */
export async function queueOverlayEvents(kind: 'pull' | 'collection', username: string, count: number, force: boolean): Promise<ActionResult> {
  const status = await getOverlayStatus();
  if (status.connected === 0 && !force) {
    return {
      ok: false,
      needsForce: true,
      message: 'No overlay is connected, so nothing would play on stream. Open the overlay in OBS first, or queue it anyway to play when one connects.',
    };
  }
  if (kind === 'pull') { // a viewer blocked from pulls (ROADMAP 55.12) is not gifted packs either
    const blocked = await blockedRefusal(username);
    if (blocked) return { ok: false, message: `${username} is blocked from pulls, so no pack was queued.` };
  }

  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID();
    // A pull is rolled here (lib/draw.ts) so the overlay can only save what was rolled. Gifts are never charged.
    const draw = kind === 'pull' ? await issueDraw(id, username) : undefined;
    if (kind === 'pull' && !draw) return { ok: false, message: 'The active season has no packs with cards to open.' };
    await enqueueEvent({ id, type: kind, username, queuedAt: Date.now(), ...(draw ? { draw } : {}) });
  }
  await recordActivity({ type: 'trigger', kind, username, source: 'admin', count });
  revalidatePath('/admin');
  revalidatePath('/admin/activity');

  const waiting = status.connected === 0 ? ' It will play when an overlay connects.' : '';
  return kind === 'pull'
    ? { ok: true, message: `Queued ${count} pack${count !== 1 ? 's' : ''} for ${username}.${waiting}` }
    : { ok: true, message: `Showing ${username}'s collection on stream.${waiting}` };
}

export async function grantCardTo(username: string, cardNumber: number, variant: Variant): Promise<ActionResult> {
  const active = await getActiveSeasonWithPacks();
  if (!active) return { ok: false, message: 'There is no active season to grant a card in.' };
  const card = active.packs.flatMap(p => p.cards).find(c => c.number === cardNumber);
  if (!card) return { ok: false, message: 'Pick a card from the list.' };

  const collectionName = active.season.collectionName;
  const made = await addCollectionEntryWithSerial(collectionName, username, encodeEntry(card.number, variant), 'grant');
  await ensureUserProfile(username);
  await recordActivity({ type: 'grant', source: 'admin', username, cardNumber: card.number, variant, collectionName, ...(made.copyId ? { copyId: made.copyId } : {}), ...(made.uid ? { uid: made.uid } : {}) });
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  return { ok: true, message: `Granted ${variant === 'regular' ? '' : VARIANT_LABELS[variant] + ' '}${card.name} (#${card.number}) to ${username}.` };
}

/** Shows one of a viewer's cards on the overlay (what a chat show-off does, POST /api/webhooks/show-card); `text` is what the viewer would type, empty = their best card. */
export async function queueShowOff(username: string, text: unknown, opts: { caption?: string; best?: boolean; uid?: number } = {}): Promise<{ ok: true; message: string; card: string; variant: string; serial: number | null } | { ok: false; error: string; message: string; retryAfter?: number }> {
  const result = await prepareShowOff(username, text, { best: opts.best, uid: opts.uid });
  if (!result.ok) return result;
  const { plan } = result;
  await enqueueEvent({
    id: crypto.randomUUID(), type: 'card', username: plan.username, queuedAt: Date.now(),
    cardNumber: plan.cardNumber, variant: plan.variant, serial: plan.serial, serialMult: plan.serialMult, uid: plan.uid,
    ...(opts.caption ? { caption: opts.caption } : {}),
  });
  await recordActivity({ type: 'trigger', kind: 'card', username: plan.username, cardName: plan.cardName });
  return { ok: true, message: plan.message, card: plan.cardName, variant: plan.variant, serial: plan.serial ?? null };
}
