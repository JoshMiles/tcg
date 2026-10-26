import { kv } from './db';
import { notify } from './trade-notify';
import { notifyFeedback } from './discord';
import { getActiveSeasonWithPacks, getCollection, getUserProfile } from './kv';
import { getBuildInfo, formatVersion } from './version';
import {
  FEEDBACK_LIMITS, REPORT_REASON_LABELS, cleanMeta, dayKey, expired, isStatus, noticeText, multiLine, oneLine,
  type FeedbackInput, type FeedbackItem, type ReportInput, type FeedbackKind, type FeedbackStatus,
} from './feedback-core';

// Suggestions and problem reports: one inbox. `feedback:<id>` holds an item, `feedback:list` the ids newest first (capped), and
// `feedback:new` the ids still waiting for staff (so the "new" counts are one SCARD). Best-effort side effects (Discord, bell).

const itemKey = (id: string) => `feedback:${id}`;
const LIST = 'feedback:list';
const NEW_SET = 'feedback:new';
const rateKey = (user: string, at: number) => `feedback:rate:${user}:${dayKey(at)}`;

type ParsedInput = Extract<FeedbackInput, { ok: true }>['value'];
type ParsedReport = Extract<ReportInput, { ok: true }>['value'];

export type SubmitResult = { ok: true; item: FeedbackItem } | { ok: false; status: number; error: string };

/** Sends used today by this viewer (UTC day). */
export async function sentToday(user: string, now = Date.now()): Promise<number> {
  return Number(await kv.get<number>(rateKey(user.toLowerCase(), now)).catch(() => 0)) || 0;
}

export async function submitFeedback(user: string, input: ParsedInput, device: unknown, now = Date.now()): Promise<SubmitResult> {
  const u = user.toLowerCase();
  const used = await sentToday(u, now);
  if (used >= FEEDBACK_LIMITS.perDay) return { ok: false, status: 429, error: `You can send ${FEEDBACK_LIMITS.perDay} messages a day. Try again tomorrow.` };
  await kv.set(rateKey(u, now), used + 1, { ex: 2 * 86_400 });
  const build = formatVersion(getBuildInfo());
  const item: FeedbackItem = {
    id: Math.random().toString(36).slice(2, 10) + now.toString(36).slice(-4),
    kind: input.kind, user: u, title: input.title, body: input.body,
    ...(input.expected ? { expected: input.expected } : {}),
    ...(input.from ? { from: input.from } : {}),
    ...(input.includeDevice ? { meta: cleanMeta(device, build) } : {}),
    at: now, status: 'new',
  };
  await kv.set(itemKey(item.id), item);
  await kv.lpush(LIST, item.id);
  await kv.ltrim(LIST, 0, FEEDBACK_LIMITS.listCap - 1);
  await kv.sadd(NEW_SET, item.id);
  await notifyFeedback(item);
  return { ok: true, item };
}

export async function getFeedback(id: string): Promise<FeedbackItem | null> {
  return (await kv.get<FeedbackItem>(itemKey(id)).catch(() => null)) ?? null;
}

async function loadMany(ids: string[]): Promise<FeedbackItem[]> {
  const items = await Promise.all(ids.map(getFeedback));
  return items.filter((i): i is FeedbackItem => !!i);
}

export interface FeedbackFilter { kind?: FeedbackKind; status?: FeedbackStatus; user?: string }

/** Newest first. The sweep runs here, so the admin page keeps the store tidy without a cron. */
export async function listFeedback(filter: FeedbackFilter = {}): Promise<FeedbackItem[]> {
  await sweepFeedback().catch(() => 0);
  const ids = (await kv.lrange<string>(LIST, 0, FEEDBACK_LIMITS.listCap - 1).catch(() => [] as string[])) ?? [];
  return (await loadMany(ids)).filter(i =>
    (!filter.kind || i.kind === filter.kind) && (!filter.status || i.status === filter.status) && (!filter.user || i.user === filter.user.toLowerCase()));
}

// ── User reports (ROADMAP 17.2) ──
// A report is an inbox item of kind 'report' with `target` and `reason`. Own daily counter, one open report per reporter per target.

const reportRateKey = (user: string, at: number) => `feedback:rate:report:${user}:${dayKey(at)}`;

export async function reportsToday(user: string, now = Date.now()): Promise<number> {
  return Number(await kv.get<number>(reportRateKey(user.toLowerCase(), now)).catch(() => 0)) || 0;
}

async function knownViewer(login: string): Promise<boolean> {
  if (await getUserProfile(login).catch(() => null)) return true;
  const active = await getActiveSeasonWithPacks().catch(() => null);
  if (!active) return false;
  return Object.keys(await getCollection(active.season.collectionName).catch(() => ({}))).some(u => u.toLowerCase() === login);
}

export async function submitReport(reporter: string, input: ParsedReport, now = Date.now()): Promise<SubmitResult> {
  const me = reporter.toLowerCase();
  if (input.target === me) return { ok: false, status: 400, error: "You can't report yourself." };
  if (!(await knownViewer(input.target))) return { ok: false, status: 404, error: "We don't know that collector." };
  if ((await feedbackOf(me)).some(i => i.kind === 'report' && i.target === input.target && i.status === 'new')) {
    return { ok: false, status: 409, error: 'You already reported this person. Staff will look at it.' };
  }
  const used = await reportsToday(me, now);
  if (used >= FEEDBACK_LIMITS.reportsPerDay) return { ok: false, status: 429, error: `You can send ${FEEDBACK_LIMITS.reportsPerDay} reports a day. Try again tomorrow.` };
  await kv.set(reportRateKey(me, now), used + 1, { ex: 2 * 86_400 });
  const item: FeedbackItem = {
    id: Math.random().toString(36).slice(2, 10) + now.toString(36).slice(-4),
    kind: 'report', user: me, title: `Report: @${input.target} (${REPORT_REASON_LABELS[input.reason]})`, body: input.details,
    target: input.target, reason: input.reason, ...(input.link ? { from: input.link } : {}),
    at: now, status: 'new',
  };
  await kv.set(itemKey(item.id), item);
  await kv.lpush(LIST, item.id);
  await kv.ltrim(LIST, 0, FEEDBACK_LIMITS.listCap - 1);
  await kv.sadd(NEW_SET, item.id);
  await notifyFeedback(item);
  return { ok: true, item };
}

/** One viewer's own items, newest first. */
export async function feedbackOf(user: string): Promise<FeedbackItem[]> {
  const ids = (await kv.lrange<string>(LIST, 0, FEEDBACK_LIMITS.listCap - 1).catch(() => [] as string[])) ?? [];
  return (await loadMany(ids)).filter(i => i.user === user.toLowerCase());
}

/** A viewer's inbox items follow the account to a new login (lib/account-move.ts). Returns how many moved. */
export async function renameFeedbackOf(from: string, to: string): Promise<number> {
  const mine = await feedbackOf(from);
  for (const i of mine) await kv.set(itemKey(i.id), { ...i, user: to.toLowerCase() });
  return mine.length;
}

/** How many items still wait for staff (a set size, so cheap enough for every admin page). */
export async function countNewFeedback(): Promise<number> {
  return Number(await kv.scard(NEW_SET).catch(() => 0)) || 0;
}

export type UpdateResult = { ok: true; item: FeedbackItem } | { ok: false; error: string };

/**
 * Staff set a status and/or write a reply. The sender hears about it in the bell (and by push if they use it): their own Settings
 * switch for this kind of notice applies. `by` is the staff login, kept on the item but never shown to the sender or in Discord.
 */
export async function updateFeedback(id: string, patch: { status?: unknown; reply?: unknown }, by: string | null, now = Date.now()): Promise<UpdateResult> {
  const item = await getFeedback(id);
  if (!item) return { ok: false, error: 'That item no longer exists.' };
  const status = isStatus(patch.status) ? patch.status : item.status;
  const reply = patch.reply === undefined ? item.reply ?? '' : multiLine(patch.reply, FEEDBACK_LIMITS.reply);
  const changed = { status: status !== item.status, reply: reply !== (item.reply ?? '') };
  if (!changed.status && !changed.reply) return { ok: true, item };
  const next: FeedbackItem = { ...item, status, ...(reply ? { reply } : {}), ...(by ? { repliedBy: oneLine(by, 40) } : {}) };
  if (!reply) delete next.reply;
  if (status !== 'new' && !next.resolvedAt) next.resolvedAt = now;
  if (status === 'new') delete next.resolvedAt;
  await kv.set(itemKey(id), next);
  if (status === 'new') await kv.sadd(NEW_SET, id); else await kv.srem(NEW_SET, id);
  const text = noticeText(next, changed);
  if (text) await notify(item.user, { kind: 'feedback', text, feedbackId: id });
  return { ok: true, item: next };
}

/**
 * Deletes items resolved more than keepDaysAfterResolved days ago and forgets ids whose item is gone. Returns how many items it deleted.
 */
export async function sweepFeedback(now = Date.now()): Promise<number> {
  const ids = (await kv.lrange<string>(LIST, 0, FEEDBACK_LIMITS.listCap - 1).catch(() => [] as string[])) ?? [];
  if (ids.length === 0) return 0;
  const items = await Promise.all(ids.map(async id => [id, await getFeedback(id)] as const));
  const gone = items.filter(([, i]) => !i || expired(i, now));
  if (gone.length === 0) return 0;
  const goneIds = new Set(gone.map(([id]) => id));
  let deleted = 0;
  for (const [id, i] of gone) {
    if (i) { await kv.del(itemKey(id)); deleted++; }
    await kv.srem(NEW_SET, id);
  }
  const keep = ids.filter(id => !goneIds.has(id));
  await kv.del(LIST);
  if (keep.length) await kv.rpush(LIST, ...keep); // pushed in the same newest-first order, so the list keeps its order
  return deleted;
}

// ── Account deletion requests (ROADMAP 11.3) ──
// A request is an inbox item of kind 'deletion', so it shares the list, the new count and the sweep. It is not counted against the
// daily send limit. Handling it (deleting the viewer, or declining) is in app/admin/feedback-actions.ts and lib/account-deletion.ts.

/** The viewer's latest deletion request (any status), newest first, or null. */
export async function deletionOf(user: string): Promise<FeedbackItem | null> {
  return (await feedbackOf(user)).find(i => i.kind === 'deletion') ?? null;
}

export type DeletionRequestResult = { ok: true; item: FeedbackItem } | { ok: false; error: string };

export async function requestDeletion(user: string, now = Date.now()): Promise<DeletionRequestResult> {
  const u = user.toLowerCase();
  const existing = await deletionOf(u);
  if (existing && existing.status === 'new') return { ok: false, error: 'You already asked for this. It is waiting for the team.' };
  const item: FeedbackItem = {
    id: Math.random().toString(36).slice(2, 10) + now.toString(36).slice(-4),
    kind: 'deletion', user: u, title: 'Delete my account', body: `@${u} asked for their account and data to be deleted.`, at: now, status: 'new',
  };
  await kv.set(itemKey(item.id), item);
  await kv.lpush(LIST, item.id);
  await kv.ltrim(LIST, 0, FEEDBACK_LIMITS.listCap - 1);
  await kv.sadd(NEW_SET, item.id);
  await notifyFeedback(item);
  return { ok: true, item };
}

/** Removes one item entirely (the list entry is dropped by the next sweep). */
export async function removeFeedbackItem(id: string): Promise<void> {
  await kv.del(itemKey(id));
  await kv.srem(NEW_SET, id);
}

/** The sender takes their request back while it is still waiting. Returns whether one was cancelled. */
export async function cancelDeletion(user: string): Promise<boolean> {
  const item = await deletionOf(user);
  if (!item || item.status !== 'new') return false;
  await removeFeedbackItem(item.id);
  await sweepFeedback().catch(() => 0);
  return true;
}

/** Marks a request done without telling the sender (the account no longer exists to be told). */
export async function closeDeletion(id: string, by: string | null, now = Date.now()): Promise<void> {
  const item = await getFeedback(id);
  if (!item) return;
  await kv.set(itemKey(id), { ...item, status: 'done' as const, resolvedAt: now, ...(by ? { repliedBy: oneLine(by, 40) } : {}) });
  await kv.srem(NEW_SET, id);
}

/** Deletes every inbox item of a viewer except the deletion request(s), which stay as the record of what was asked. */
export async function deleteFeedbackOf(user: string): Promise<number> {
  const mine = (await feedbackOf(user)).filter(i => i.kind !== 'deletion');
  for (const i of mine) await removeFeedbackItem(i.id);
  if (mine.length) await sweepFeedback().catch(() => 0);
  return mine.length;
}
