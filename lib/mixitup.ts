// Mix It Up paid pulls, the server side (ROADMAP Track 12; the pure parts are in mixitup-core.ts). A pull is reserved when the
// pull webhook arrives (limit and balance checked), claimed when the overlay saves the card, and charged BEFORE the print is
// written; if Mix It Up does not confirm the charge, no print is made, and if the print then cannot be written the charge is refunded.
import { kv, inSandbox } from './db';
import { CHANNEL_LOGIN } from './site';
import { sendWebhook } from './webhook-send';
import { noteOutgoing, outKindOf } from './mixitup-health';
import { noteRefusal } from './bridge-notice';
import { bridgePullStart, bridgeRunCommand, callBridge, feedOn } from './bridge';
import { feedOf, matchRule, pullArgs, shoutText, type PullFacts } from './pull-rules-core';
import { getActiveSeason, getUserCards, listSeasons, withLock } from './kv';
import { getLiveStatus } from './twitch-live';
import { notifySystem } from './discord';
import { getHappyHour } from './happyhour';
import { getStreamBuff, getUserPullLimit } from './pull-limit';
import { effectiveLimit, streamBuffAmount } from './pull-limit-core';
import { extraPullsFromBuffs, releaseExtraPackCredit, reserveExtraPackCredit } from './buffs';
import {
  hasAddRoute, hasViewersRoute, normalizeMixItUp, parseBalance, parseViewers, pullPrice, pullRole, refusalMessage, renderMessage, replyApplied, roleLimitOf, streamKey, decide,
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
 * The rule's OBS actions (55.8) start here too: a source is shown now, and `eventId` (sent back to the overlay) lets its reveal report
 * trigger the scene switch and the clip.
 */
export async function firePullRules(pull: PullFacts, delayMs = 0, eventId?: string): Promise<boolean> {
  try {
    if (await inSandbox()) return false;
    const rules = (await getMixItUpSettings()).pullRules;
    const hit = rules.length ? matchRule(rules, pull) : null;
    const feed = eventId && (await feedOn()) ? feedOf(pull) : undefined; // the app's live pull feed (55.11) wants every reveal, rule or not
    if (!hit && !feed) return false;
    const command = hit?.commandId ? await bridgeRunCommand(hit.commandId, pullArgs(pull), delayMs) : false;
    const text = hit?.say ? shoutText(hit.say, pull) : ''; // the chat line waits for the reveal like the scene and clip (55.10)
    const obs = hit?.obs || text || feed ? await bridgePullStart({ ...hit?.obs, ...(text ? { text } : {}), ...(feed ? { feed } : {}) }, delayMs, eventId) : false;
    return command || obs;
  } catch {
    return false;
  }
}

// ── The request log (last 20) ──
export interface MixItUpLogEntry { at: number; username: string; what: 'balance' | 'deduct' | 'add' | 'test' | 'revoked' | 'refused' | 'command' | 'watchdog' | 'check' | 'pull' | 'grant' | 'buff'; ok: boolean; detail: string }
const LOG_KEEP = 50; // the site's calls out and Mix It Up's requests in (ROADMAP 55.3)
/** An event reward's log line with what the app's event feed (57.7) also shows: the event and its amount. The same `detail` as the log line. */
export type MixItUpEvent = Pick<MixItUpLogEntry, 'at' | 'username' | 'ok' | 'detail'> & { event: string; amount?: number };
const EVENTS = 'mixitup:events';
export const EVENTS_KEEP = 30;
export async function logMixItUp(e: Omit<MixItUpLogEntry, 'at'>, event?: { name: string; amount?: number }): Promise<void> {
  const at = Date.now();
  try { await kv.lpush(LOG, { ...e, at }); await kv.ltrim(LOG, 0, LOG_KEEP - 1); } catch { /* the log never breaks a pull */ }
  // shortcut: the event feed is its own short list (the log's 50 lines are mostly chat pulls), written with the same line; upgrade if the two ever need to be one store.
  if (event) try { await kv.lpush(EVENTS, { at, username: e.username, event: event.name, ...(event.amount ? { amount: event.amount } : {}), ok: e.ok, detail: e.detail } satisfies MixItUpEvent); await kv.ltrim(EVENTS, 0, EVENTS_KEEP - 1); } catch { /* never breaks a reward */ }
  if (e.what === 'refused') await noteRefusal(e.detail.split(':')[0].trim(), e.username); // a staff notice, throttled (55.13)
}
/** The last event rewards, newest first; only those after `after` (a time in ms) when given. */
export async function getEventFeed(after = 0): Promise<MixItUpEvent[]> {
  try { return ((await kv.lrange<MixItUpEvent>(EVENTS, 0, EVENTS_KEEP - 1)) ?? []).filter(e => e.at > after); } catch { return []; }
}
export async function getMixItUpLog(): Promise<MixItUpLogEntry[]> {
  try { return (await kv.lrange<MixItUpLogEntry>(LOG, 0, LOG_KEEP - 1)) ?? []; } catch { return []; }
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
    const error = /timeout|aborted/i.test(sent.error) ? `Mix It Up did not answer in ${TIMEOUT_MS / 1000} seconds` : sent.error;
    if (kind) await noteOutgoing(kind, false, error);
    return { ok: false, status: 0, body: null, error };
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
const cdKey = (user: string) => `mixitup:cd:${user}`;
const ffKey = (user: string) => `user:${user}:firstfree`;

/** `amount` is the price worked out when the pull was reserved (ROADMAP 55.4b); a record from before has none. `firstFree` = this pull holds the viewer's first-free flag (55.4h). */
interface PayRecord { username: string; amount: number; stream: string; at: number; credit?: boolean; firstFree?: boolean }
/** `left` = paid pulls left this stream after this one (only with a limit); `balance` = what Mix It Up said before the price is taken; `price` = what this pull costs (stored on the reservation); `firstFree` = the price is 0 because it is their first pack. */
export type Reservation = { ok: true; left?: number; balance?: number; price?: number; firstFree?: boolean } | { ok: false; reason: RefusalReason; message: string; balance?: number };

/** The window "per stream" counts in: the live Twitch stream's start, else the UTC day. */
export async function currentStreamKey(): Promise<string> {
  const live = await getLiveStatus().catch(() => null);
  const started = live?.live && live.startedAt ? Date.parse(live.startedAt) : NaN;
  return streamKey(Number.isFinite(started) ? started : null);
}

/**
 * Before a pull is queued: is the viewer under their limit and able to pay? On success the pull is reserved under `payId` (limit
 * and in-flight counts raised, until the pull is claimed or the reservation expires). A sandbox never calls out and never charges.
 * `packPrice` is the price of the pack the pull opens (55.4f); it sets the price before role price, base price and happy hour.
 * `test` = a simulated pull (55.14): it never takes or holds the real viewer's first-free flag.
 */
export async function reservePaidPull(s: MixItUpSettings, username: string, payId: string, doFetch?: Fetch, role?: unknown, packPrice?: number, test = false): Promise<Reservation> {
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
  // First pack free (55.4h): SET NX takes the flag so two quick !packs cannot both be free. The flag stays set (forever) for a viewer who
  // already has cards in any season, which also means that history is read once per viewer, not on every !pack. An unreadable history
  // frees the flag again and charges normally.
  let ffHeld = false;
  if (s.firstPackFree && !test && (await kv.set(ffKey(user), 1, { nx: true }))) {
    const had = await Promise.all((await listSeasons()).map(x => getUserCards(x.collectionName, user))).then(all => all.some(cards => cards.length > 0), () => null);
    if (had === false) ffHeld = true;
    else if (had === null) await kv.del(ffKey(user));
  }
  const price = pullPrice(s, { role: pullRole(role, user), happyHour: await getHappyHour(), packPrice, firstFree: ffHeld });
  const limit = effectiveLimit(roleLimitOf(s, pullRole(role, user)), await getUserPullLimit(user), Date.now(), extra).limit;
  let cdHeld = false; // this pull holds the viewer's cooldown key (below)
  const refuse = async (reason: RefusalReason, balance?: number, why?: string, wait?: number): Promise<Reservation> => {
    if (cdHeld) await kv.del(cdKey(user)); // a refused pull does not start a cooldown
    if (ffHeld) await kv.del(ffKey(user)); // and does not use up the first free pack
    await logMixItUp({ username: user, what: 'refused', ok: false, detail: `${reason}${why ? `: ${why}` : ''}` });
    return { ok: false, reason, message: refusalMessage(reason, { ...s, cost: price, limit }, user, balance, wait), ...(balance !== undefined ? { balance } : {}) };
  };

  // Cooldown (55.4d): claimed before the limit count so its own refusal leaves nothing behind; refuse() drops it again for any later refusal.
  if (s.cooldownSeconds > 0 && user !== CHANNEL_LOGIN) {
    if (await kv.set(cdKey(user), 1, { nx: true, ex: s.cooldownSeconds })) cdHeld = true;
    else { const wait = Math.max(1, Number(await kv.ttl(cdKey(user)))); return refuse('cooldown', undefined, `${wait} seconds left`, wait); }
  }

  let counted = false;
  let left: number | undefined;
  if (limit > 0) {
    const used = await kv.incr(cntKey(stream, user));
    left = Math.max(0, limit - used);
    await kv.expire(cntKey(stream, user), COUNT_TTL_S);
    counted = true;
    if (used > limit) { await kv.decr(cntKey(stream, user)); return refuse('limit_reached'); }
  }
  const undo = async () => { if (counted) await kv.decr(cntKey(stream, user)); };

  // A price of 0 needs no balance: nothing will be taken, and the pull still counts toward the limit above.
  let balance: number | undefined;
  if (price > 0) {
    const got = await fetchBalance(s, user, doFetch);
    await logMixItUp({ username: user, what: 'balance', ok: got.balance !== null, detail: got.balance !== null ? `${got.balance} ${s.currency}` : got.error ?? 'no answer' });
    if (got.balance === null) { await undo(); return refuse(got.error?.startsWith('no number') ? 'bad_balance' : 'mixitup_unavailable', undefined, got.error); }
    balance = got.balance;
    // Never below this pull's own price: a claim of a reservation made before 55.4b takes off its whole price where the counter held a count.
    const owed = Math.max(price, await kv.incrby(pendKey(user), price)); // the sum of the prices in flight, this pull included
    await kv.expire(pendKey(user), 600);
    if (!decide({ balance, owed })) {
      await kv.incrby(pendKey(user), -price); await undo();
      return refuse('insufficient_balance', balance);
    }
  }
  await kv.set(payKey(payId), { username: user, amount: price, stream, at: Date.now(), ...(ffHeld ? { firstFree: true } : {}) } satisfies PayRecord, { ex: PAY_TTL_S });
  return { ok: true, price, ...(ffHeld ? { firstFree: true } : {}), ...(balance !== undefined ? { balance } : {}), ...(left !== undefined ? { left } : {}) };
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
  // The stored price is what is charged. A reservation from before role prices has none and uses the current base price.
  const amount = typeof rec.amount === 'number' && Number.isFinite(rec.amount) ? rec.amount : (await getMixItUpSettings()).cost;
  await kv.incrby(pendKey(rec.username), -amount).catch(() => {});
  return { payId, username: rec.username, amount, stream: rec.stream, credit: !!rec.credit };
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
  await kv.incrby(pendKey(rec.username), -(typeof rec.amount === 'number' ? rec.amount : 0)).catch(() => {});
  if (rec.credit) await releaseExtraPackCredit(rec.username);
  else await kv.del(cdKey(rec.username)).catch(() => {}); // the pull never happened, so no cooldown either
  if (rec.firstFree) await kv.del(ffKey(rec.username)).catch(() => {}); // and the first free pack is still theirs
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
