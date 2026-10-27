// Mix It Up paid pulls, the server side (ROADMAP Track 12; the pure parts are in mixitup-core.ts). A pull is reserved when the
// pull webhook arrives (limit and balance checked), claimed when the overlay saves the card, and charged BEFORE the print is
// written; if Mix It Up does not confirm the charge, no print is made, and if the print then cannot be written the charge is refunded.
import { kv, inSandbox } from './db';
import { sendWebhook } from './webhook-send';
import { noteOutgoing, outKindOf } from './mixitup-health';
import { bridgeRunCommand, callBridge } from './bridge';
import { matchRule, pullArgs, type PullFacts } from './pull-rules-core';
import { getActiveSeason, withLock } from './kv';
import { getLiveStatus } from './twitch-live';
import { notifySystem } from './discord';
import { getStreamBuff, getUserPullLimit } from './pull-limit';
import { effectiveLimit, streamBuffAmount } from './pull-limit-core';
import { extraPullsFromBuffs, releaseExtraPackCredit, reserveExtraPackCredit } from './buffs';
import {
  hasAddRoute, hasViewersRoute, normalizeMixItUp, parseBalance, parseViewers, pullRole, refusalMessage, renderMessage, replyApplied, roleLimitOf, streamKey, decide,
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

/**
 * Runs the first Mix It Up command whose rule this pull meets (ROADMAP 55.6d). Called once per ticketed save, so it fires as the overlay
 * reveals the pull. Does not wait for the command; never throws; a sandbox, no rules or no paired bridge do nothing. True when queued.
 */
export async function firePullRules(pull: PullFacts): Promise<boolean> {
  try {
    if (await inSandbox()) return false;
    const rules = (await getMixItUpSettings()).pullRules;
    const hit = rules.length ? matchRule(rules, pull) : null;
    return hit ? await bridgeRunCommand(hit.commandId, pullArgs(pull)) : false;
  } catch {
    return false;
  }
}

// ── The request log (last 20) ──
export interface MixItUpLogEntry { at: number; username: string; what: 'balance' | 'deduct' | 'add' | 'test' | 'revoked' | 'refused' | 'command'; ok: boolean; detail: string }
export async function logMixItUp(e: Omit<MixItUpLogEntry, 'at'>): Promise<void> {
  try { await kv.lpush(LOG, { ...e, at: Date.now() }); await kv.ltrim(LOG, 0, 19); } catch { /* the log never breaks a pull */ }
}
export async function getMixItUpLog(): Promise<MixItUpLogEntry[]> {
  try { return (await kv.lrange<MixItUpLogEntry>(LOG, 0, 19)) ?? []; } catch { return []; }
}

// ── Talking to Mix It Up ──
export type Fetch = typeof fetch;
export interface Reply { ok: boolean; status: number; body: unknown; error?: string }

/** POSTs JSON to a Mix It Up webhook command and reads its answer. Public addresses only, resolved and never redirected (lib/webhook-send.ts); never throws. */
export async function callMixItUp(url: string, payload: Record<string, unknown>, doFetch?: Fetch): Promise<Reply> {
  const sent = await sendWebhook(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store',
  }, doFetch);
  const kind = outKindOf(payload.action);
  if (!sent.ok) {
    if (kind) await noteOutgoing(kind, false, sent.error);
    return { ok: false, status: 0, body: null, error: sent.error };
  }
  if (kind) await noteOutgoing(kind, sent.res.ok, `HTTP ${sent.res.status}`);
  const raw = await sent.res.text().catch(() => '');
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* a plain-text answer is fine */ }
  return { ok: sent.res.ok, status: sent.res.status, body };
}

/** One request to Mix It Up: a job for TCG Bridge in bridge mode, else the saved address. Both answer with a Reply. */
const callOut = (s: MixItUpSettings, url: string, payload: Record<string, unknown>, doFetch?: Fetch): Promise<Reply> =>
  s.connection === 'bridge' ? callBridge(s, payload) : callMixItUp(url, payload, doFetch);

const deductUrl = (s: MixItUpSettings) => s.deductUrl || s.balanceUrl;

/** Asks Mix It Up for one viewer's balance. */
export async function fetchBalance(s: MixItUpSettings, username: string, doFetch?: Fetch): Promise<{ balance: number | null; error?: string }> {
  const r = await callOut(s, s.balanceUrl, { action: 'balance', secret: s.secret, username, currency: s.currency }, doFetch);
  if (!r.ok) return { balance: null, error: r.error ?? `HTTP ${r.status}` };
  const field = s.connection === 'bridge' ? 'balance' : s.balanceField; // the bridge's answer always has the number at `balance`
  const balance = parseBalance(r.body, field);
  return balance === null ? { balance: null, error: `no number at "${field}" in the reply` } : { balance };
}

/** Gives a viewer currency through the add address (the currency-grant buff). Applied = Mix It Up said so. */
export async function grantCurrency(s: MixItUpSettings, username: string, amount: number, doFetch?: Fetch): Promise<{ applied: boolean; error?: string }> {
  if (!s.enabled || !hasAddRoute(s)) return { applied: false, error: 'Mix It Up is off or has no add address.' };
  if (await inSandbox()) return { applied: true };
  const r = await callOut(s, s.addUrl, { action: 'add', secret: s.secret, username, amount, currency: s.currency }, doFetch);
  const applied = replyApplied(r.status, r.body);
  await logMixItUp({ username, what: 'add', ok: applied, detail: applied ? `+${amount} ${s.currency}` : r.error ?? `HTTP ${r.status}, not applied` });
  return applied ? { applied } : { applied, error: r.error ?? `HTTP ${r.status}` };
}

/** Who is in stream chat now, from the viewers address. */
export async function fetchChatViewers(s: MixItUpSettings, doFetch?: Fetch): Promise<{ users: string[]; error?: string }> {
  if (!s.enabled || !hasViewersRoute(s)) return { users: [], error: 'Mix It Up is off or has no chat viewers address.' };
  const r = await callOut(s, s.viewersUrl, { action: 'viewers', secret: s.secret, currency: s.currency }, doFetch);
  if (!r.ok) return { users: [], error: r.error ?? `HTTP ${r.status}` };
  const users = parseViewers(r.body);
  if (!users) return { users: [], error: 'no users list in the reply' };
  return users.length ? { users } : { users, error: 'nobody is in chat' };
}

// ── Currency grants (the currency-grant buff): a record per grant so a partial payout can be finished without paying anyone twice ──
export interface GrantRecord { id: string; name: string; amount: number; at: number; users: Record<string, 'pending' | 'paid' | 'failed'> }
const grantKey = (id: string) => `buffgrant:${id}`;
const GRANT_INDEX = 'buffgrants:open';

const unpaidOf = (r: GrantRecord) => Object.values(r.users).filter(v => v !== 'paid').length;

/** Pays every user of the grant not yet marked paid, one at a time, saving after each so a crash never repays anyone. */
export async function runGrant(s: MixItUpSettings, id: string, doFetch?: Fetch): Promise<{ total: number; unpaid: number } | null> {
  return withLock(grantKey(id), async () => {
    const rec = await kv.get<GrantRecord>(grantKey(id));
    if (!rec) return null;
    for (const u of Object.keys(rec.users)) {
      if (rec.users[u] === 'paid') continue;
      rec.users[u] = (await grantCurrency(s, u, rec.amount, doFetch)).applied ? 'paid' : 'failed';
      await kv.set(grantKey(id), rec);
    }
    const unpaid = unpaidOf(rec);
    await withLock('buffgrants:index', async () => {
      const ids = (await kv.get<string[]>(GRANT_INDEX)) ?? [];
      const next = unpaid > 0 ? [...new Set([...ids, id])].slice(-50) : ids.filter(x => x !== id);
      await kv.set(GRANT_INDEX, next);
    });
    return { total: Object.keys(rec.users).length, unpaid };
  });
}

/** Records the target list, then pays it. The record stays open (see getOpenGrants) while anyone is unpaid. */
export async function startGrant(s: MixItUpSettings, name: string, amount: number, users: string[], doFetch?: Fetch): Promise<{ id: string; total: number; unpaid: number }> {
  const id = crypto.randomUUID();
  const rec: GrantRecord = { id, name, amount, at: Date.now(), users: Object.fromEntries(users.map(u => [u, 'pending' as const])) };
  await kv.set(grantKey(id), rec);
  const r = (await runGrant(s, id, doFetch)) ?? { total: users.length, unpaid: users.length };
  return { id, ...r };
}

/** Grants with someone still unpaid. */
export async function getOpenGrants(): Promise<{ id: string; name: string; amount: number; unpaid: number; total: number }[]> {
  const ids = (await kv.get<string[]>(GRANT_INDEX).catch(() => null)) ?? [];
  const recs = await Promise.all(ids.map(id => kv.get<GrantRecord>(grantKey(id)).catch(() => null)));
  return recs.filter((r): r is GrantRecord => !!r && unpaidOf(r) > 0).map(r => ({ id: r.id, name: r.name, amount: r.amount, unpaid: unpaidOf(r), total: Object.keys(r.users).length }));
}

/** Sends a message that deducts nothing, so the command can be tried without a real pull. */
export async function sendTest(s: MixItUpSettings, doFetch?: Fetch): Promise<Reply> {
  return callOut(s, deductUrl(s), { action: 'test', secret: s.secret, username: 'tcg-test', amount: 0, currency: s.currency, message: renderMessage(s.message, { username: 'tcg-test', amount: 0, currency: s.currency, cardName: 'Test Card', variant: 'Regular', stars: 1, packName: 'Test', cardNumber: 1, serial: 1 }) }, doFetch);
}

// ── Reserve ──
const cntKey = (stream: string, user: string) => `mixitup:cnt:${stream}:${user}`;
const pendKey = (user: string) => `mixitup:pending:${user}`;
const payKey = (id: string) => `mixitup:pay:${id}`;

interface PayRecord { username: string; amount: number; stream: string; at: number; credit?: boolean }
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

  // If the viewer has an active extra-pack credit, bypass limit and fee (ROADMAP 30.2 / Decision 4). The credit is held for this
  // pull until it is saved (consumePullOnSave) or released, so pulls queued together cannot all use the same one.
  const season = await getActiveSeason().catch(() => null);
  if (await reserveExtraPackCredit(user, { now: Date.now(), streamKey: stream, seasonId: season?.id })) {
    await kv.set(payKey(payId), { username: user, amount: 0, stream, at: Date.now(), credit: true } satisfies PayRecord, { ex: PAY_TTL_S });
    return { ok: true };
  }

  // Their own limit replaces the role default. A this-stream bonus adds on top. 0 = no limit, and bonuses cannot change that.
  const extra = streamBuffAmount(await getStreamBuff(), stream) + await extraPullsFromBuffs(user);
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
export interface Claimed { payId: string; username: string; amount: number; stream: string; credit?: boolean }

/** Takes a reservation (once). Null = unknown, expired, already used, or for another viewer: nothing is saved then. */
export async function claimPaidPull(payId: string, username: string): Promise<Claimed | null> {
  const rec = await kv.get<PayRecord>(payKey(payId));
  if (!rec || rec.username !== username.toLowerCase()) return null;
  if ((await kv.del(payKey(payId))) !== 1) return null; // someone else claimed it first
  await kv.decr(pendKey(rec.username)).catch(() => {});
  return { payId, username: rec.username, amount: rec.amount, stream: rec.stream, credit: !!rec.credit };
}

export interface PullDetails { cardName: string; variant: string; stars: number; packName: string; cardNumber: number; serial?: number | null }

/** Tells Mix It Up to take the currency, with the message about the card. Applied = it said so. */
export async function chargePaidPull(s: MixItUpSettings, c: Claimed, d: PullDetails, doFetch?: Fetch): Promise<{ applied: boolean; error?: string }> {
  if (c.credit || c.amount === 0) return { applied: true };
  if (await inSandbox()) return { applied: true };
  const message = renderMessage(s.message, { username: c.username, amount: c.amount, currency: s.currency, cardName: d.cardName, variant: d.variant, stars: d.stars, packName: d.packName, cardNumber: d.cardNumber, serial: d.serial ?? '' });
  const r = await callOut(s, deductUrl(s), { action: 'deduct', secret: s.secret, username: c.username, amount: c.amount, currency: s.currency, message, pullId: c.payId }, doFetch);
  const applied = replyApplied(r.status, r.body);
  await logMixItUp({ username: c.username, what: 'deduct', ok: applied, detail: applied ? `${c.amount} ${s.currency}` : r.error ?? `HTTP ${r.status}, not applied` });
  return applied ? { applied } : { applied, error: r.error ?? `HTTP ${r.status}` };
}

/** Cancels a reservation whose pull never got queued: the viewer's allowance and in-flight count come back. */
export async function releasePaidPull(payId: string): Promise<void> {
  const rec = await kv.get<PayRecord>(payKey(payId)).catch(() => null);
  if (!rec || (await kv.del(payKey(payId))) !== 1) return;
  await kv.decr(pendKey(rec.username)).catch(() => {});
  if (rec.credit) await releaseExtraPackCredit(rec.username);
  await releaseCount({ payId, username: rec.username, amount: rec.amount, stream: rec.stream, credit: rec.credit });
}

/** A claimed pull that was not charged: give the viewer's pull allowance back. */
export async function releaseCount(c: Claimed): Promise<void> {
  if (c.credit) return;
  await kv.decr(cntKey(c.stream, c.username)).catch(() => {});
}

/** The charge was not confirmed, so no print was made: give the viewer's pull allowance back and tell staff. */
export async function noticeUnpaid(c: Claimed, cardName: string, why: string): Promise<void> {
  await releaseCount(c);
  await logMixItUp({ username: c.username, what: 'revoked', ok: false, detail: `${cardName}: ${why}` });
  await notifySystem({ title: 'A paid pull was not given', text: `${c.username}'s ${cardName} was not given because Mix It Up did not confirm the payment (${why}).`, tone: 'bad' });
}

/**
 * The charge went through but the print could not be saved: pay the viewer back through the add address (the same call the
 * currency-grant buff uses) and give the allowance back. If the refund cannot be made, staff are told to do it by hand.
 */
export async function refundPaidPull(s: MixItUpSettings, c: Claimed, cardName: string, doFetch?: Fetch): Promise<void> {
  await releaseCount(c);
  if (c.credit) { await releaseExtraPackCredit(c.username); return; }
  if (c.amount === 0) return;
  const r = await grantCurrency(s, c.username, c.amount, doFetch);
  if (r.applied) return;
  await logMixItUp({ username: c.username, what: 'revoked', ok: false, detail: `${cardName}: refund of ${c.amount} ${s.currency} not made (${r.error ?? 'not applied'})` });
  await notifySystem({ title: 'A paid pull needs a manual refund', text: `${c.username} was charged ${c.amount} ${s.currency} for ${cardName} but the print could not be saved, and the automatic refund failed (${r.error ?? 'not applied'}). Refund them by hand.`, tone: 'bad' });
}
