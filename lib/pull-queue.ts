// What a chat !pack does once the pull webhook has checked who is asking: reserve the payment (paid pulls), roll a ticket, queue it for
// the overlay. POST /api/webhooks/pull and the Mix It Up page's "Simulate a chat pull" (ROADMAP 55.14) both call this, so a test runs the
// code a viewer hits. A test passes `test` and a `trace` id: the ticket is marked, the activity event says so and each step is noted
// (lib/mixitup-trace.ts). Without a trace id nothing extra is written, so a real pull is unchanged.
import { enqueueEvent } from './webhooks';
import { recordActivity } from './activity';
import { getMixItUpSettings, releasePaidPull, reservePaidPull } from './mixitup';
import { inSandbox } from './db';
import { dropDraw, issueDraw } from './draw';
import { traceStep } from './mixitup-trace';
import { isPullsPaused, PAUSED_MESSAGE } from './pull-pause';
import { blockedRefusal } from './pull-block';
import { replyText } from './mixitup-core';

export interface PullOptions {
  /** What the webhook sent as `role` (limits are per role). */
  role?: unknown;
  /** A simulated pull: its edition is saved apart from the season and counts nowhere. */
  test?: boolean;
  /** The test's trace id; steps are noted only when it is given. */
  trace?: string;
  /** A free pull: no balance check and no charge, like a free !pack. Used by tests; the webhook never sets it. */
  free?: boolean;
}

/** Returns the JSON the webhook answers with. Throws only when the queue itself fails (after undoing what was reserved). */
export async function queuePull(username: string, o: PullOptions = {}): Promise<Record<string, unknown>> {
  const note = (step: Parameters<typeof traceStep>[1], state: Parameters<typeof traceStep>[2], detail?: string) => traceStep(o.trace, step, state, detail);
  await note('received', 'ok', `A !pack for ${username}${o.test ? ' (simulated)' : ''}`);

  // Paused (ROADMAP 55.9): a viewer's pull queues nothing. A test, and a free pack the streamer gave, still go through.
  if (!o.test && !o.free && (await isPullsPaused())) {
    await note('balance', 'failed', PAUSED_MESSAGE);
    return { ok: true, ignored: true, reason: 'paused', message: PAUSED_MESSAGE };
  }

  // Blocked from pulls by staff (ROADMAP 55.12): refused like any other refusal. A test and a free pack the streamer gave still go through.
  if (!o.test && !o.free) {
    const blocked = await blockedRefusal(username);
    if (blocked) {
      await note('balance', 'failed', blocked.message);
      return { ok: true, ignored: true, ...blocked };
    }
  }

  // Paid pulls (Settings → Mix It Up): the viewer's limit and balance are checked first; a refusal queues nothing and says why.
  const id = crypto.randomUUID();
  const mix = await getMixItUpSettings();
  const paid = mix.enabled && !o.free && !(await inSandbox());
  let known: { left?: number; balance?: number } = {};
  let cost = mix.cost; // a paid pull shows the price stored on its reservation
  if (paid) {
    const r = await reservePaidPull(mix, username, id, undefined, o.role);
    if (!r.ok) {
      await note('balance', 'failed', r.message);
      return { ok: true, ignored: true, reason: r.reason, message: r.message, ...(r.balance !== undefined ? { balance: r.balance } : {}) };
    }
    cost = r.price ?? mix.cost;
    known = { ...(r.left !== undefined ? { left: r.left } : {}), ...(r.balance !== undefined ? { balance: r.balance } : {}) };
    await note('balance', 'ok', `Mix It Up answered and ${username} can pay ${cost.toLocaleString()} ${mix.currency}`);
  } else {
    await note('balance', 'skipped', o.free ? 'Free pull: no balance check' : mix.enabled ? 'A sandbox never asks Mix It Up' : 'Paid pulls are off: no balance check');
  }

  const draw = await issueDraw(id, username, paid, o.test && o.trace ? { trace: o.trace } : undefined);
  if (!draw) {
    if (paid) await releasePaidPull(id);
    const message = replyText('no_packs', mix.replies, { username, cost: cost.toLocaleString(), currency: mix.currency });
    await note('queued', 'failed', message);
    return { ok: true, ignored: true, reason: 'no_packs', message };
  }
  try {
    await enqueueEvent({ id, type: 'pull', username, queuedAt: Date.now(), draw, ...(paid ? { paid: true } : {}) });
  } catch (e) {
    await dropDraw(id);
    if (paid) await releasePaidPull(id);
    throw e;
  }
  await note('queued', 'ok', 'A ticket was rolled and the pull is waiting for the overlay');
  await recordActivity({ type: 'trigger', kind: 'pull', username, ...(o.test ? { test: true as const } : {}) });
  const message = replyText('queued', mix.replies, { username, cost: cost.toLocaleString(), currency: mix.currency, left: known.left, balance: known.balance?.toLocaleString() });
  return { ok: true, message, ...known };
}
