// Mix It Up paid pulls, the server side (ROADMAP Track 12; the pure parts are in mixitup-core.ts). A pull is reserved when the
// pull webhook arrives (limit and balance checked), claimed when the overlay saves the card, and charged then; if Mix It Up does
// not confirm the charge, the print is revoked.
import { kv, inSandbox } from './db';
import { checkWebhookUrl } from './webhook-clean';
import { getCollection, saveCollection, withCollectionLock } from './kv';
import { getCopy } from './serials';
import { entryOf, isEscrow } from './serials-core';
import { getLiveStatus } from './twitch-live';
import { notifySystem } from './discord';
import { getStreamBuff, getUserPullLimit } from './pull-limit';
import { effectiveLimit, streamBuffAmount } from './pull-limit-core';
import {
  normalizeMixItUp, parseBalance, pullRole, refusalMessage, renderMessage, replyApplied, roleLimitOf, streamKey, decide,
  type MixItUpSettings, type RefusalReason,
} from './mixitup-core';

const KEY = 'mixitup:settings';
const LOG = 'mixitup:log';
const TIMEOUT_MS = 5000;
const PAY_TTL_S = 12 * 3600; // as long as a draw ticket (lib/draw.ts)
const COUNT_TTL_S = 3 * 86400;

export async function getMixItUpSettings(): Promise<MixItUpSettings> {
  return normalizeMixItUp(await kv.get(KEY).catch(() => null));
}
export async function saveMixItUpSettings(s: MixItUpSettings): Promise<void> {
  await kv.set(KEY, normalizeMixItUp(s));
}

// ── The request log (last 20) ──
export interface MixItUpLogEntry { at: number; username: string; what: 'balance' | 'deduct' | 'test' | 'revoked' | 'refused' | 'command'; ok: boolean; detail: string }
export async function logMixItUp(e: Omit<MixItUpLogEntry, 'at'>): Promise<void> {
  try { await kv.lpush(LOG, { ...e, at: Date.now() }); await kv.ltrim(LOG, 0, 19); } catch { /* the log never breaks a pull */ }
}
export async function getMixItUpLog(): Promise<MixItUpLogEntry[]> {
  try { return (await kv.lrange<MixItUpLogEntry>(LOG, 0, 19)) ?? []; } catch { return []; }
}

// ── Talking to Mix It Up ──
export type Fetch = typeof fetch;
export interface Reply { ok: boolean; status: number; body: unknown; error?: string }

/** POSTs JSON to a Mix It Up webhook command and reads its answer. Only public http(s) addresses; never throws. */
export async function callMixItUp(url: string, payload: Record<string, unknown>, doFetch: Fetch = fetch): Promise<Reply> {
  const t = checkWebhookUrl(url);
  if (!t.ok || !t.url) return { ok: false, status: 0, body: null, error: t.ok ? 'no address set' : t.error };
  try {
    const res = await doFetch(t.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store',
    });
    const raw = await res.text().catch(() => '');
    let body: unknown = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* a plain-text answer is fine */ }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e instanceof Error ? e.message : 'no answer' };
  }
}

const deductUrl = (s: MixItUpSettings) => s.deductUrl || s.balanceUrl;

/** Asks Mix It Up for one viewer's balance. */
export async function fetchBalance(s: MixItUpSettings, username: string, doFetch?: Fetch): Promise<{ balance: number | null; error?: string }> {
  const r = await callMixItUp(s.balanceUrl, { action: 'balance', secret: s.secret, username, currency: s.currency }, doFetch);
  if (!r.ok) return { balance: null, error: r.error ?? `HTTP ${r.status}` };
  const balance = parseBalance(r.body, s.balanceField);
  return balance === null ? { balance: null, error: `no number at "${s.balanceField}" in the reply` } : { balance };
}

/** Sends a message that deducts nothing, so the command can be tried without a real pull. */
export async function sendTest(s: MixItUpSettings, doFetch?: Fetch): Promise<Reply> {
  return callMixItUp(deductUrl(s), { action: 'test', secret: s.secret, username: 'tcg-test', amount: 0, currency: s.currency, message: renderMessage(s.message, { username: 'tcg-test', amount: 0, currency: s.currency, cardName: 'Test Card', variant: 'Regular', stars: 1, packName: 'Test', cardNumber: 1, serial: 1 }) }, doFetch);
}

// ── Reserve ──
const cntKey = (stream: string, user: string) => `mixitup:cnt:${stream}:${user}`;
const pendKey = (user: string) => `mixitup:pending:${user}`;
const payKey = (id: string) => `mixitup:pay:${id}`;

interface PayRecord { username: string; amount: number; stream: string; at: number }
export type Reservation = { ok: true } | { ok: false; reason: RefusalReason; message: string; balance?: number };

/** The window "per stream" counts in: the live Twitch stream's start, else the UTC day. */
export async function currentStreamKey(): Promise<string> {
  const live = await getLiveStatus().catch(() => null);
  const started = live?.live && live.startedAt ? Date.parse(live.startedAt) : NaN;
  return streamKey(Number.isFinite(started) ? started : null);
}

/**
 * Before a pull is queued: is the viewer under their limit and able to pay? On success the pull is reserved under `payId` (limit
 * and in-flight counts raised, until the pull is claimed or the reservation expires). A sandbox never calls out and never charges.
 */
export async function reservePaidPull(s: MixItUpSettings, username: string, payId: string, doFetch?: Fetch, role?: unknown): Promise<Reservation> {
  const user = username.toLowerCase();
  const stream = await currentStreamKey();
  // Their own limit replaces the role default. A this-stream bonus adds on top. 0 = no limit, and bonuses cannot change that.
  const extra = streamBuffAmount(await getStreamBuff(), stream);
  const limit = effectiveLimit(roleLimitOf(s, pullRole(role, user)), await getUserPullLimit(user), Date.now(), extra).limit;
  const refuse = async (reason: RefusalReason, balance?: number, why?: string): Promise<Reservation> => {
    await logMixItUp({ username: user, what: 'refused', ok: false, detail: `${reason}${why ? `: ${why}` : ''}` });
    return { ok: false, reason, message: refusalMessage(reason, { ...s, limit }, user, balance), ...(balance !== undefined ? { balance } : {}) };
  };

  let counted = false;
  if (limit > 0) {
    const used = await kv.incr(cntKey(stream, user));
    await kv.expire(cntKey(stream, user), COUNT_TTL_S);
    counted = true;
    if (used > limit) { await kv.decr(cntKey(stream, user)); return refuse('limit_reached'); }
  }
  const undo = async () => { if (counted) await kv.decr(cntKey(stream, user)); };

  const { balance, error } = await fetchBalance(s, user, doFetch);
  await logMixItUp({ username: user, what: 'balance', ok: balance !== null, detail: balance !== null ? `${balance} ${s.currency}` : error ?? 'no answer' });
  if (balance === null) { await undo(); return refuse(error?.startsWith('no number') ? 'bad_balance' : 'mixitup_unavailable', undefined, error); }

  const pending = await kv.incr(pendKey(user));
  await kv.expire(pendKey(user), 600);
  if (!decide({ balance, cost: s.cost, pending })) {
    await kv.decr(pendKey(user)); await undo();
    return refuse('insufficient_balance', balance);
  }
  await kv.set(payKey(payId), { username: user, amount: s.cost, stream, at: Date.now() } satisfies PayRecord, { ex: PAY_TTL_S });
  return { ok: true };
}

/** How many paid pulls a viewer has used in the current stream window (for the admin's user page). */
export async function pullsUsedThisStream(username: string): Promise<number> {
  const n = Number(await kv.get(cntKey(await currentStreamKey(), username.toLowerCase())).catch(() => 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Claim, charge, revoke ──
export interface Claimed { payId: string; username: string; amount: number; stream: string }

/** Takes a reservation (once). Null = unknown, expired, already used, or for another viewer: nothing is saved then. */
export async function claimPaidPull(payId: string, username: string): Promise<Claimed | null> {
  const rec = await kv.get<PayRecord>(payKey(payId));
  if (!rec || rec.username !== username.toLowerCase()) return null;
  if ((await kv.del(payKey(payId))) !== 1) return null; // someone else claimed it first
  await kv.decr(pendKey(rec.username)).catch(() => {});
  return { payId, username: rec.username, amount: rec.amount, stream: rec.stream };
}

export interface PullDetails { cardName: string; variant: string; stars: number; packName: string; cardNumber: number; serial?: number | null }

/** Tells Mix It Up to take the currency, with the message about the card. Applied = it said so. */
export async function chargePaidPull(s: MixItUpSettings, c: Claimed, d: PullDetails, doFetch?: Fetch): Promise<{ applied: boolean; error?: string }> {
  if (await inSandbox()) return { applied: true };
  const message = renderMessage(s.message, { username: c.username, amount: c.amount, currency: s.currency, cardName: d.cardName, variant: d.variant, stars: d.stars, packName: d.packName, cardNumber: d.cardNumber, serial: d.serial ?? '' });
  const r = await callMixItUp(deductUrl(s), { action: 'deduct', secret: s.secret, username: c.username, amount: c.amount, currency: s.currency, message, pullId: c.payId }, doFetch);
  const applied = replyApplied(r.status, r.body);
  await logMixItUp({ username: c.username, what: 'deduct', ok: applied, detail: applied ? `${c.amount} ${s.currency}` : r.error ?? `HTTP ${r.status}, not applied` });
  return applied ? { applied } : { applied, error: r.error ?? `HTTP ${r.status}` };
}

/** Cancels a reservation whose pull never got queued: the viewer's allowance and in-flight count come back. */
export async function releasePaidPull(payId: string): Promise<void> {
  const rec = await kv.get<PayRecord>(payKey(payId)).catch(() => null);
  if (!rec || (await kv.del(payKey(payId))) !== 1) return;
  await kv.decr(pendKey(rec.username)).catch(() => {});
  await releaseCount({ payId, username: rec.username, amount: rec.amount, stream: rec.stream });
}

/** A claimed pull that was not charged: give the viewer's pull allowance back. */
export async function releaseCount(c: Claimed): Promise<void> {
  await kv.decr(cntKey(c.stream, c.username)).catch(() => {});
}

/**
 * Takes the print back after a failed charge: removed from the viewer's collection and retired in the copy ledger, under the
 * collection lock. Returns their new collection, or null if the print was no longer theirs (nothing changed then).
 */
export async function revokePrint(collectionName: string, username: string, entry: number, copyId: string | null): Promise<number[] | null> {
  const user = username.toLowerCase();
  const out = await withCollectionLock(collectionName, async () => {
    const data = await getCollection(collectionName);
    const owned = data[user] ?? [];
    const copy = copyId ? await getCopy(collectionName, copyId) : null;
    if (copy && (copy.owner !== user || isEscrow(copy.owner))) return null;
    const i = owned.lastIndexOf(copy ? entryOf(copy) : entry);
    if (i < 0) return null;
    data[user] = [...owned.slice(0, i), ...owned.slice(i + 1)];
    if (data[user].length === 0) delete data[user];
    await saveCollection(collectionName, data, copy ? { retire: { owner: user, ids: [copy.id], who: user, note: 'payment failed' } } : undefined);
    return data[user] ?? [];
  });
  return out;
}

export async function noticeRevoked(username: string, cardName: string, why: string): Promise<void> {
  await logMixItUp({ username, what: 'revoked', ok: false, detail: `${cardName}: ${why}` });
  await notifySystem({ title: 'A paid pull was revoked', text: `${username}'s ${cardName} was taken back because Mix It Up did not confirm the payment (${why}).`, tone: 'bad' });
}
