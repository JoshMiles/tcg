// Test pulls (ROADMAP 55.14), the server side. "Simulate a chat pull" runs queuePull (lib/pull-queue.ts, the same function the pull webhook
// runs) as a test viewer; the ticket carries `test`, so the overlay plays it, POST /api/collection saves it to the TEST collection (a hash
// beside the season's, so nothing that reads the season ever sees it) and notes each step here. Undo removes it and pays a paid one back.
import { kv, inSandbox } from './db';
import { getOverlayStatus } from './overlay';
import { grantCurrency, getMixItUpSettings } from './mixitup';
import { queuePull } from './pull-queue';
import { withCollectionLock, updateCollection } from './kv';
import { decodeEntry, VARIANT_LABELS } from './variants';
import { cleanLogin } from './staff-core';
import { LOCK_TTL_S, isTestCollection } from './mixitup-test-core';
import { LOCK, MADE_TTL_S, RECENT, madeKey, readTrace, releaseLock, traceStep, type MadeTest } from './mixitup-trace';

export interface RecentTest { id: string; username: string; paid: boolean; at: number }
export interface RecentTestRow extends RecentTest { state: 'running' | 'ok' | 'failed' | 'expired'; saved: boolean; undone: boolean; cardName?: string }

/** The last five simulated pulls, newest first, with how each went. */
export async function recentTests(): Promise<RecentTestRow[]> {
  const list = (await kv.lrange<RecentTest>(RECENT, 0, 4).catch(() => [])) ?? [];
  return Promise.all(list.map(async r => {
    const [steps, made] = await Promise.all([readTrace(r.id), kv.get<MadeTest>(madeKey(r.id)).catch(() => null)]);
    const failed = steps.some(s => s.state === 'failed');
    const done = steps.some(s => s.step === 'chat');
    const state = steps.length === 0 && !made ? 'expired' : failed ? 'failed' : done ? 'ok' : Date.now() - r.at > 60_000 ? 'failed' : 'running';
    return { ...r, state, saved: !!made, undone: !!made?.undone, ...(made ? { cardName: made.cardName } : {}) };
  }));
}

export interface TestStart { ok: boolean; message: string; needsForce?: boolean; id?: string }

/**
 * Starts one simulated pull. Refuses a viewer who is not on the list, a second one while one is running (a 90 second lock), a paid test in a
 * sandbox (it never calls the real bridge) or with paid pulls off, and, unless `force`, when no overlay is connected (it would not play).
 */
export async function startTestPull(o: { username: unknown; paid: boolean; force?: boolean }): Promise<TestStart> {
  const username = cleanLogin(o.username);
  const settings = await getMixItUpSettings();
  if (!username || !settings.testViewers.includes(username)) return { ok: false, message: `${username ?? 'That name'} is not a test viewer. Add them on the Connection tab first, so a real viewer is never touched.` };
  if (o.paid) {
    if (await inSandbox()) return { ok: false, message: 'A paid test needs production: a sandbox never calls TCG Bridge. Choose a free pull here.' };
    if (!settings.enabled) return { ok: false, message: 'Paid pulls are switched off, so nothing would be charged. Switch them on in Paid pulls, or choose a free pull.' };
  }
  if (!o.force && (await getOverlayStatus()).connected === 0) {
    return { ok: false, needsForce: true, message: 'No overlay is connected, so nothing would play on stream. Open the overlay in OBS first, or queue it anyway to play when one connects.' };
  }
  const id = crypto.randomUUID();
  if (!(await kv.set(LOCK, id, { nx: true, ex: LOCK_TTL_S }))) return { ok: false, message: 'A test pull is already running. Wait for it to finish (up to 90 seconds).' };
  try {
    await kv.lpush(RECENT, { id, username, paid: o.paid, at: Date.now() } satisfies RecentTest);
    await kv.ltrim(RECENT, 0, 4);
    const body = await queuePull(username, { test: true, trace: id, free: !o.paid });
    if (body.ignored) { await releaseLock(id); return { ok: false, id, message: String(body.message ?? 'The pull was refused.') }; }
  } catch (e) {
    await traceStep(id, 'queued', 'failed', e instanceof Error ? e.message : 'The pull could not be queued.');
    return { ok: false, id, message: 'The pull could not be queued. The steps list says where.' };
  }
  return { ok: true, id, message: `Simulated a ${o.paid ? 'paid' : 'free'} !pack for ${username}. It plays when the overlay picks it up.` };
}

/**
 * Takes a test edition back out of the test collection and, when the pull was paid, gives the currency back through the add route. Works
 * only on a saved test pull; anything else is refused. The caller has already checked who is asking and writes the audit line.
 */
export async function undoTestPull(id: string): Promise<{ ok: boolean; message: string; username?: string; detail?: string }> {
  const made = typeof id === 'string' && id ? await kv.get<MadeTest>(madeKey(id)).catch(() => null) : null;
  if (!made || !isTestCollection(made.collectionName)) return { ok: false, message: 'That is not a saved test pull, so nothing was undone. Only test pulls can be undone here.' };
  if (made.undone) return { ok: false, message: 'That test pull was already undone.' };
  const { entry, username, collectionName } = made;
  const removed = await withCollectionLock(collectionName, () => updateCollection(collectionName, [username], cards => {
    const i = cards[username].indexOf(entry);
    return i === -1 ? { result: false } : { result: true, cards: { [username]: [...cards[username].slice(0, i), ...cards[username].slice(i + 1)] } };
  }));
  const { cardNumber, variant } = decodeEntry(entry);
  const what = `${made.cardName} (${VARIANT_LABELS[variant]}, #${cardNumber})`;
  await kv.set(madeKey(id), { ...made, undone: true }, { ex: MADE_TTL_S });
  let refund = '';
  if (made.paid && made.amount > 0) {
    const s = await getMixItUpSettings();
    const r = await grantCurrency(s, username, made.amount);
    refund = r.applied ? ` ${made.amount} ${s.currency} paid back.` : ` The refund of ${made.amount} ${s.currency} could not be made (${r.error ?? 'not applied'}): give it back by hand.`;
  }
  const base = removed ? `Removed ${what} from ${username}'s test collection.` : `${what} was already gone from ${username}'s test collection.`;
  return { ok: true, username, message: base + refund, detail: `${what}${refund ? ',' + refund.trimEnd() : ''}` };
}
