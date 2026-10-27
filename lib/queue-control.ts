// Queue control (ROADMAP 55.9): see, skip and clear what waits for the overlay. The dashboard's Clear queue and TCG Bridge's Skip and Clear
// both end here. A pull that is thrown away is refunded the way a refused paid pull is: its ticket is dropped and its reservation
// released (lib/pull-queue.ts), so the viewer keeps their allowance and is not charged. Events leave the list with an atomic pop, so one
// the overlay is taking at the same moment is never refunded twice.
import { dequeueEvent, peekQueue, type QueuedEvent } from './webhooks';
import { getActiveSeasonWithPacks } from './kv';
import { dropDraw } from './draw';
import { releasePaidPull } from './mixitup';

export interface QueueRow { id: string; kind: 'pull' | 'show-off'; username: string; pack: string; waitedS: number }

/** Who is waiting, which pack and for how long, the next one first. */
export async function readQueue(now = Date.now()): Promise<QueueRow[]> {
  const events = await peekQueue();
  const packs = events.some(e => e.draw) ? ((await getActiveSeasonWithPacks().catch(() => null))?.packs ?? []) : [];
  return events.map(e => ({
    id: e.id, kind: e.type === 'pull' ? 'pull' : 'show-off', username: e.username,
    pack: packs.find(p => p.pack.id === e.draw?.packId)?.pack.name ?? '',
    waitedS: Math.max(0, Math.round((now - e.queuedAt) / 1000)),
  }));
}

async function refund(e: QueuedEvent): Promise<void> {
  if (e.type !== 'pull') return;
  await dropDraw(e.id);
  if (e.paid) await releasePaidPull(e.id);
}

/** Throws away the next event and refunds it. Null when the queue was empty. */
export async function skipNext(): Promise<QueuedEvent | null> {
  const e = await dequeueEvent();
  if (e) await refund(e);
  return e;
}

/** Throws away everything waiting, refunding the pulls. How many events there were. */
export async function clearQueueRefunding(): Promise<number> {
  let n = 0;
  for (let e = await dequeueEvent(); e; e = await dequeueEvent()) { n++; await refund(e); }
  return n;
}
