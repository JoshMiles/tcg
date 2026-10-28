// TCG Bridge, the server side (ROADMAP 55.0; the pure parts are in bridge-core.ts). Mix It Up cannot answer an HTTP request with custom
// JSON, so in "bridge" mode a call to Mix It Up becomes a job on a KV list; the desktop app on the stream PC long-polls for jobs, runs
// them through Mix It Up's local Developer API and posts a result, which the waiting call reads. Keys: `bridge:jobs` (list),
// `bridge:result:<id>` (60 s), `bridge:pair:<code>` (600 s), `bridge:tokens` (hash: sha256 of a token -> record), `mixitup:bridge` (hash:
// at, appVersion, mixitupVersion, commit, currencies, commands; the health row, the currency select and the pull rules' command select), `bridge:obs` (what the bridge last saw in OBS, 55.6b).
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { kv, inSandbox } from './db';
import { clientIp, limitWebhook, rateLimit } from './rate-limit';
import { noteOutgoing, outKindOf } from './mixitup-health';
import type { MixItUpSettings } from './mixitup-core';
import type { PullObs } from './pull-rules-core';
import type { LedgerRow } from './bridge-chat-core';
import { noteUptime } from './bridge-uptime';
import type { StaffRole } from './staff-core';
import {
  BRIDGE_DID_NOT_ANSWER, CONNECTED_MS, IDLE_POLL_MS, LONG_POLL_MS, PAIR_TTL_S, POLL_MS, RESULT_TTL_S, ROLE_CHECK_MS, TOUCH_EVERY_MS, WAIT_MS,
  isStaffPc, cleanHello, cleanName, cleanObs, cleanResult, hashToken, isFreshJob, newPairCode, normalizeCode, replyFromResult, type PullFeed,
  type BridgeCommand, type BridgeCurrency, type BridgeJob, type BridgeReply, type JobKind, type ObsSnapshot, type StaffNotice,
} from './bridge-core';

const JOBS = 'bridge:jobs';
const TOKENS = 'bridge:tokens';
const STATE = 'mixitup:bridge';
const OBS = 'bridge:obs';
const FEED = 'bridge:feed';
const resultKey = (id: string) => `bridge:result:${id}`;
const pairKey = (code: string) => `bridge:pair:${code}`;

/** The timings, in one object so scripts/check-bridge.mts can shorten them. */
export const tuning = { waitMs: WAIT_MS, pollMs: POLL_MS, longPollMs: LONG_POLL_MS, idlePollMs: IDLE_POLL_MS };
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * `by` is the admin who paired this PC; `staff` is the per-PC switch for the staff tools (ROADMAP 55.12), off until an admin turns it on.
 * A PC linked with Twitch (58.0) has `userId` (Twitch's numeric id), `login` and `role` (the site role, re-read at most once a minute, `roleCheckedAt`);
 * its staff tools follow the role and `staff` is ignored. `by` is then the login.
 */
export interface BridgeToken { id: string; name: string; createdAt: number; lastSeen: number; by?: string; staff?: boolean; userId?: string; login?: string; role?: StaffRole; roleCheckedAt?: number }

// ── The calling side: put a job on the list and wait for its result ──

/** Sends one request the way callMixItUp would, through the bridge. Never throws. A sandbox never creates a job. */
export async function callBridge(s: Pick<MixItUpSettings, 'currencyId'>, payload: Record<string, unknown>): Promise<BridgeReply> {
  if (await inSandbox()) return { ok: false, status: 0, body: null, error: 'A sandbox does not use TCG Bridge.' };
  const action = payload.action;
  const kind: JobKind = action === 'test' ? 'say' : (action as JobKind);
  const job: BridgeJob = {
    id: crypto.randomUUID(), kind, at: Date.now(),
    ...(typeof payload.username === 'string' && kind !== 'say' ? { username: payload.username } : {}),
    ...(typeof payload.amount === 'number' ? { amount: payload.amount } : {}),
    ...(s.currencyId ? { currencyId: s.currencyId } : {}),
    ...(typeof payload.message === 'string' ? { text: payload.message } : {}),
  };
  let reply: BridgeReply;
  try {
    await kv.rpush(JOBS, job);
    if ((kind === 'deduct' || kind === 'add') && job.username && job.amount) await noteCharge({ id: job.id, user: job.username.toLowerCase(), amount: kind === 'deduct' ? -job.amount : job.amount, at: job.at });
    reply = replyFromResult(kind, await waitForResult(job.id));
  } catch (e) {
    reply = { ok: false, status: 0, body: null, error: e instanceof Error ? e.message : 'TCG Bridge call failed' };
  }
  const health = outKindOf(action);
  if (health) await noteOutgoing(health, reply.ok, reply.ok ? 'via TCG Bridge' : reply.error ?? 'failed');
  return reply;
}

// The site's own record of every charge and refund it sent (ROADMAP 55.10), for the Brie Bucks check. The Mix It Up log keeps only 20.
const CHARGES = 'bridge:charges';
const CHARGES_MAX = 2000;
async function noteCharge(row: LedgerRow): Promise<void> {
  try { await kv.rpush(CHARGES, row); await kv.ltrim(CHARGES, -CHARGES_MAX, -1); } catch { /* the check is a nicety */ }
}
export async function readCharges(): Promise<LedgerRow[]> {
  try { return (await kv.lrange<LedgerRow>(CHARGES, 0, -1)) ?? []; } catch { return []; }
}

async function waitForResult(id: string) {
  const end = Date.now() + tuning.waitMs;
  while (Date.now() < end) {
    await sleep(tuning.pollMs);
    const r = cleanResult(await kv.get(resultKey(id)));
    if (r) return r;
  }
  // Give up with a marker so a result that comes later is refused (see storeResult). NX fails when a real result landed meanwhile: use it.
  const gaveUp = { id, ok: false, error: BRIDGE_DID_NOT_ANSWER, late: true };
  if (await kv.set(resultKey(id), gaveUp, { nx: true, ex: RESULT_TTL_S })) return null;
  return cleanResult(await kv.get(resultKey(id)));
}

/** Asks the bridge to press "Refresh cache of current page" on the overlay browser source in OBS and waits for the answer. Never throws. */
export async function refreshOverlayInObs(): Promise<{ ok: boolean; error?: string }> {
  if (await inSandbox()) return { ok: false, error: 'A sandbox does not use TCG Bridge.' };
  try {
    const id = crypto.randomUUID();
    await kv.rpush(JOBS, { id, kind: 'obs-refresh', at: Date.now() } satisfies BridgeJob);
    const r = await waitForResult(id);
    return r?.ok ? { ok: true } : { ok: false, error: r?.error || BRIDGE_DID_NOT_ANSWER };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'TCG Bridge call failed' };
  }
}

/** Posts a line in chat through the bridge and does not wait (the start and end posts of 55.10 use it). Never throws; a sandbox sends nothing. */
export async function bridgeSay(text: string): Promise<void> {
  try {
    if (await inSandbox()) return;
    await kv.rpush(JOBS, { id: crypto.randomUUID(), kind: 'say', text: text.slice(0, 400), at: Date.now() } satisfies BridgeJob);
  } catch { /* chat is a nicety */ }
}

/**
 * Asks the bridge to run one of Mix It Up's commands (ROADMAP 55.6d) and does not wait: a pull never waits on it. Nothing is queued in a
 * sandbox or when no bridge is paired. Never throws. True when a job was queued.
 */
export async function bridgeRunCommand(commandId: string, args: string[], delayMs = 0): Promise<boolean> {
  try {
    if (await inSandbox()) return false;
    if (!(await listBridges()).length) return false;
    await kv.rpush(JOBS, { id: crypto.randomUUID(), kind: 'run-command', commandId, args: args.slice(0, 10).map(a => a.slice(0, 200)), ...(delayMs > 0 ? { delayMs } : {}), at: Date.now() } satisfies BridgeJob);
    return true;
  } catch {
    return false;
  }
}

// ── Staff notices (ROADMAP 55.13) ──
// A notice goes on a short list of its own for each PC whose staff switch is on, so a PC without staff tools never sees one. The list lives
// 60 s and a notice older than the job age limit is dropped: a notice sent while the app is offline is gone.
const noticeKey = (pcId: string) => `bridge:notices:${pcId}`;

/** Queues a notice for every staff PC and does not wait. Never throws; nothing in a sandbox or when no PC has staff tools. True when queued. */
export async function sendNotice(notice: StaffNotice): Promise<boolean> {
  try {
    if (await inSandbox()) return false;
    const pcs = (await listBridges()).filter(isStaffPc);
    const job = { id: crypto.randomUUID(), kind: 'notice', at: Date.now(), notice } satisfies BridgeJob;
    for (const pc of pcs) { await kv.rpush(noticeKey(pc.id), job); await kv.expire(noticeKey(pc.id), 60); }
    return pcs.length > 0;
  } catch {
    return false;
  }
}

async function claimNotices(pcId: string, now = Date.now()): Promise<BridgeJob[]> {
  const jobs: BridgeJob[] = [];
  while (jobs.length < 5) {
    const j = await kv.lpop<BridgeJob>(noticeKey(pcId));
    if (j === null || j === undefined) break;
    if (isFreshJob(j, now)) jobs.push(j);
  }
  return jobs;
}

/** Queues any job and does not wait. Nothing is queued in a sandbox or when no bridge is paired. Never throws. True when queued. */
export async function bridgeQueue(job: Omit<BridgeJob, 'id' | 'at'>): Promise<boolean> {
  try {
    if (await inSandbox()) return false;
    if (!(await listBridges()).length) return false;
    await kv.rpush(JOBS, { ...job, id: crypto.randomUUID(), at: Date.now() } satisfies BridgeJob);
    return true;
  } catch {
    return false;
  }
}

// ── OBS actions on big pulls (ROADMAP 55.8) ──
// A pull that meets a rule with OBS actions: the source is shown as the pack starts opening (job queued at once, hidden again after `holdMs`),
// and the scene switch and the clip wait for the overlay's reveal report (`pullevent:<id>` is what the report looks up and claims).
const pullEventKey = (id: string) => `bridge:pullevent:${id}`;
const PULL_EVENT_TTL_S = 120;
/** A pull's OBS actions plus the chat line (55.10), the line already rendered. */
export type PullBridge = PullObs & { text?: string; feed?: PullFeed };
const revealPart = (o: PullBridge): Partial<BridgeJob> => ({ ...(o.scene ? { scene: o.scene, secs: o.sceneSecs } : {}), ...(o.clip ? { clip: true } : {}), ...(o.text ? { text: o.text } : {}), ...(o.feed ? { feed: o.feed } : {}) });

// The live pull feed window (ROADMAP 55.11) is off until the app says it is open: `bridge:feed` is set by the app's report. Only then does a pull
// leave its card facts for the reveal, so nothing extra is stored or queued when the window is unused.
export async function setFeedOn(on: boolean): Promise<void> {
  if (on) await kv.set(FEED, 1, { ex: 7 * 86400 });
  else await kv.del(FEED);
}
export const feedOn = async (): Promise<boolean> => !!(await kv.get(FEED).catch(() => null));

/** The start of a pull's OBS actions. `holdMs` is how long until the reveal. True when anything was queued or kept for the reveal. */
export async function bridgePullStart(o: PullBridge,holdMs: number, eventId?: string): Promise<boolean> {
  try {
    if ((await inSandbox()) || !(await listBridges()).length) return false;
    const later = Object.keys(revealPart(o)).length > 0 && !!eventId;
    if (later) await kv.set(pullEventKey(eventId!), revealPart(o), { ex: PULL_EVENT_TTL_S });
    const shown = o.source ? await bridgeQueue({ kind: 'pull-event', phase: 'start', source: o.source, holdMs }) : false;
    return later || shown;
  } catch {
    return false;
  }
}

/** The overlay says the pull `eventId` was revealed: queue its scene switch and clip, once (the key is claimed). True when queued. */
export async function bridgePullReveal(eventId: string): Promise<boolean> {
  try {
    const part = await kv.get<Partial<BridgeJob>>(pullEventKey(eventId));
    if (!part || (await kv.del(pullEventKey(eventId))) !== 1) return false; // DEL's count is the claim: of two reports, one wins
    return await bridgeQueue({ kind: 'pull-event', phase: 'reveal', ...part });
  } catch {
    return false;
  }
}

/** The rule's Test button: the OBS actions now, with a 3 s source and no overlay. */
export async function bridgePullTest(o: PullBridge): Promise<boolean> {
  const a = o.source ? await bridgeQueue({ kind: 'pull-event', phase: 'start', source: o.source, holdMs: 3000 }) : false;
  const b = Object.keys(revealPart(o)).length ? await bridgeQueue({ kind: 'pull-event', phase: 'reveal', ...revealPart(o) }) : false;
  return a || b;
}

// ── Pairing and tokens ──

/** A one-time code for the staff page, good for 10 minutes. */
export async function createPairCode(by: string): Promise<{ code: string; expiresAt: number }> {
  const code = newPairCode();
  await kv.set(pairKey(code), { by, at: Date.now() }, { ex: PAIR_TTL_S });
  return { code, expiresAt: Date.now() + PAIR_TTL_S * 1000 };
}

/** Makes a bridge token for a PC. Only its hash is stored; the plain token goes to the bridge once. */
export async function mintToken(name: string, extra: Partial<BridgeToken> = {}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await kv.hset(TOKENS, { [hashToken(token)]: { id: randomBytes(6).toString('hex'), name, createdAt: Date.now(), lastSeen: 0, ...extra } satisfies BridgeToken });
  return token;
}

// shortcut: pairing codes stay until the app can sign in with Twitch (58.0, app half); remove createPairCode / pairBridge / the pair route then.
/** Swaps a code (used once: the delete is the claim) for a token. Only its hash is stored; the token is shown to the bridge once. */
export async function pairBridge(rawCode: unknown, rawName: unknown): Promise<{ token: string; name: string } | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const made = await kv.get<{ by?: string }>(pairKey(code));
  if ((await kv.del(pairKey(code))) !== 1) return null;
  const name = cleanName(rawName);
  return { token: await mintToken(name, made?.by ? { by: made.by } : {}), name };
}

/** The paired bridges for the staff page (no token and no hash). */
export async function listBridges(): Promise<BridgeToken[]> {
  const all = await kv.hgetall<Record<string, BridgeToken>>(TOKENS).catch(() => null);
  return Object.values(all ?? {}).sort((a, b) => a.createdAt - b.createdAt);
}

/** Revokes a bridge by its id (its token stops working at once). Its name, or null when there was none. */
export async function revokeBridge(id: string): Promise<string | null> {
  const all = await kv.hgetall<Record<string, BridgeToken>>(TOKENS).catch(() => null);
  const hit = Object.entries(all ?? {}).find(([, t]) => t.id === id);
  if (!hit) return null;
  await kv.hdel(TOKENS, hit[0]);
  return hit[1].name;
}

/** Switches the staff tools of one PC on or off (ROADMAP 55.12). Its name, or null when there was no such PC. */
export async function setBridgeStaff(id: string, on: boolean): Promise<string | null> {
  const all = await kv.hgetall<Record<string, BridgeToken>>(TOKENS).catch(() => null);
  const hit = Object.entries(all ?? {}).find(([, t]) => t.id === id);
  if (!hit) return null;
  await kv.hset(TOKENS, { [hit[0]]: { ...hit[1], staff: on } });
  return hit[1].name;
}

/** Notes a bridge was seen (at most once per 10 s) and who it is. False when the token has been revoked. */
async function touchBridge(hash: string, version?: string, now = Date.now()): Promise<boolean> {
  const rec = await kv.hget<BridgeToken>(TOKENS, hash);
  if (!rec) return false;
  if (now - rec.lastSeen < TOUCH_EVERY_MS) return true;
  if (rec.lastSeen && now - rec.lastSeen > CONNECTED_MS) { // it was away: the uptime history gets the gap (55.11)
    await noteUptime('bridge', false, rec.lastSeen + CONNECTED_MS);
    await noteUptime('bridge', true, now);
  }
  // shortcut: a revoke between the read and this write could bring the token back, when it matters make it one EVAL.
  await kv.hset(TOKENS, { [hash]: { ...rec, lastSeen: now } });
  await kv.hset(STATE, { at: now, ...(version ? { appVersion: version } : {}) });
  return true;
}

/** `appVersion` is TCG Bridge's own (sent with every poll), `mixitupVersion` is Mix It Up's (sent with the hello). An old stored `version` was one or the other, so it is ignored. */
export interface BridgeState { at: number | null; appVersion: string; mixitupVersion: string; commit: string; currencies: BridgeCurrency[]; commands: BridgeCommand[] }
/** What the bridge last said (for the currency select and the health chip). */
export async function readBridge(): Promise<BridgeState> {
  const h = await kv.hgetall<{ at?: number | string; appVersion?: string; mixitupVersion?: string; commit?: string; currencies?: BridgeCurrency[]; commands?: BridgeCommand[] }>(STATE).catch(() => null);
  const at = Number(h?.at);
  return { at: Number.isFinite(at) && at > 0 ? at : null, appVersion: h?.appVersion ?? '', mixitupVersion: h?.mixitupVersion ?? '', commit: h?.commit ?? '', currencies: Array.isArray(h?.currencies) ? h.currencies : [], commands: Array.isArray(h?.commands) ? h.commands : [] };
}

// ── The API routes' side ──

/** First lines of every route but pair: the rate limit, then the Bearer token (its sha256 must be in the paired list). */
export async function bridgeGuard(req: Request): Promise<{ ok: true; hash: string; pc: BridgeToken } | { ok: false; response: NextResponse }> {
  const limited = await limitWebhook(req);
  if (limited) return { ok: false, response: limited };
  const token = /^Bearer (\S{1,200})$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const hash = token ? hashToken(token) : '';
  const pc = hash ? await kv.hget<BridgeToken>(TOKENS, hash) : null;
  if (!pc || !(await recheckRole(hash, pc))) return { ok: false, response: NextResponse.json({ error: 'Unknown token' }, { status: 401 }) };
  return { ok: true, hash, pc };
}

/**
 * A PC linked with Twitch (58.0) keeps its token only while its account still has a site role: re-read at most once a minute per token (the
 * check time is on the record, so a normal call adds no read). A lost role deletes the token, which is exactly what an admin unlinking does;
 * a changed role is saved on the record. A KV failure keeps the PC. Dynamic imports: staff and audit reach back to this file through discord.
 */
async function recheckRole(hash: string, pc: BridgeToken, now = Date.now()): Promise<boolean> {
  if (!pc.userId || now - (pc.roleCheckedAt ?? 0) < ROLE_CHECK_MS) return true;
  let role: StaffRole | null;
  try { role = await (await import('./staff')).liveRole(pc.login ?? '', pc.userId); } catch { return true; }
  if (!role) {
    await kv.hdel(TOKENS, hash);
    await (await import('./audit')).recordAudit('everyone', 'TCG Bridge unlinked, the account lost its staff role', `${pc.name}, ${pc.login}`).catch(() => {});
    return false;
  }
  pc.role = role;
  pc.roleCheckedAt = now;
  // An unlink while the role was being read must stay an unlink. shortcut: a revoke between this check and the write still slips through, as in touchBridge.
  if (!(await kv.hexists(TOKENS, hash))) return false;
  await kv.hset(TOKENS, { [hash]: pc });
  return true;
}

/** The staff routes' guard (ROADMAP 55.12): bridgeGuard, then this PC must have the staff switch on. A sandbox never has staff powers. */
export async function bridgeStaffGuard(req: Request): Promise<{ ok: true; hash: string; pc: BridgeToken } | { ok: false; response: NextResponse }> {
  const g = await bridgeGuard(req);
  if (!g.ok) return g;
  if (!isStaffPc(g.pc) || (await inSandbox())) return { ok: false, response: NextResponse.json({ error: 'Staff tools are off for this PC.' }, { status: 403 }) };
  return g;
}

/** The pair route's guard: the general limit, then 10 tries per address per 10 minutes, so a code cannot be guessed. */
export async function pairGuard(req: Request): Promise<NextResponse | null> {
  const limited = await limitWebhook(req);
  if (limited) return limited;
  const ok = await rateLimit('bridge-pair', clientIp(req.headers), 10, 600).catch(() => true);
  return ok ? null : NextResponse.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429, headers: { 'Retry-After': '600' } });
}

/** The link routes' guard (58.0): the general limit, then `max` calls per address per `windowS` (a request is rare; the app polls every 2 s, so its limit is a lot higher). */
export async function linkGuard(req: Request, name: 'bridge-link' | 'bridge-link-poll'): Promise<NextResponse | null> {
  const limited = await limitWebhook(req);
  if (limited) return limited;
  const [max, windowS] = name === 'bridge-link' ? [10, 600] : [60, 60];
  const ok = await rateLimit(name, clientIp(req.headers), max, windowS).catch(() => true);
  return ok ? null : NextResponse.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429, headers: { 'Retry-After': String(windowS) } });
}

/** Takes the fresh jobs off the list (LPOP is atomic: two pollers never get the same job) and drops the stale ones. */
export async function claimJobs(now = Date.now()): Promise<BridgeJob[]> {
  const jobs: BridgeJob[] = [];
  while (jobs.length < 20) {
    const j = await kv.lpop<BridgeJob>(JOBS);
    if (j === null || j === undefined) break;
    if (isFreshJob(j, now)) jobs.push(j);
  }
  return jobs;
}

/** The long-poll: jobs as soon as there are any, else an empty list after `longPollMs`. Null when the token was revoked meanwhile. */
export async function pollJobs(hash: string, version?: string, noticesFor?: string): Promise<BridgeJob[] | null> {
  const end = Date.now() + tuning.longPollMs;
  for (;;) {
    if (!(await touchBridge(hash, version))) return null;
    const jobs = [...(noticesFor ? await claimNotices(noticesFor) : []), ...(await claimJobs())];
    if (jobs.length || Date.now() + tuning.idlePollMs >= end) return jobs;
    await sleep(tuning.idlePollMs);
  }
}

/** Stores a result for the waiting call: 'bad' for a wrong shape, 'late' when the waiter already gave up on that job. A repeat of a stored result is 'stored'. */
export async function storeResult(raw: unknown): Promise<'stored' | 'late' | 'bad'> {
  const r = cleanResult(raw);
  if (!r) return 'bad';
  if (await kv.set(resultKey(r.id), r, { nx: true, ex: RESULT_TTL_S })) return 'stored';
  const had = await kv.get<{ late?: boolean }>(resultKey(r.id));
  return had && had.late === true ? 'late' : 'stored';
}

/** Stores what a bridge saw in OBS, with the time. False when the shape is wrong. */
export async function storeObs(raw: unknown): Promise<boolean> {
  const o = cleanObs(raw);
  if (!o) return false;
  await kv.set(OBS, { at: Date.now(), ...o } satisfies ObsSnapshot);
  return true;
}

/** What a bridge last saw in OBS, or null when none ever reported it. */
export async function readObs(): Promise<ObsSnapshot | null> {
  const raw = await kv.get<Record<string, unknown>>(OBS).catch(() => null);
  const o = cleanObs(raw);
  const at = Number(raw?.at);
  return o && Number.isFinite(at) ? { at, ...o } : null;
}

/** Stores what a bridge announces: the Mix It Up version it found (the app's own version comes with each poll), its commit (empty from an older app or a dev run, so a stale one never stays), the currencies the select offers and the Mix It Up commands the rules offer. An older app sends no commands: the stored list is kept. False when the shape is wrong. */
export async function storeHello(raw: unknown): Promise<boolean> {
  const h = cleanHello(raw);
  if (!h) return false;
  await kv.hset(STATE, { at: Date.now(), mixitupVersion: h.version, commit: h.commit ?? '', currencies: h.currencies, ...(h.commands ? { commands: h.commands } : {}) });
  return true;
}
