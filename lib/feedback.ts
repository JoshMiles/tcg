import { kv } from './db';
import { notify } from './trade-notify';
import { notifyFeedback } from './discord';
import { getBuildInfo, formatVersion } from './version';
import {
  FEEDBACK_LIMITS, cleanMeta, dayKey, expired, isStatus, noticeText, multiLine, oneLine,
  type FeedbackInput, type FeedbackItem, type FeedbackKind, type FeedbackStatus,
} from './feedback-core';

// Suggestions and problem reports: one inbox. `feedback:<id>` holds an item, `feedback:list` the ids newest first (capped), and
// `feedback:new` the ids still waiting for staff (so the "new" counts are one SCARD). Best-effort side effects (Discord, bell).

const itemKey = (id: string) => `feedback:${id}`;
const LIST = 'feedback:list';
const NEW_SET = 'feedback:new';
const rateKey = (user: string, at: number) => `feedback:rate:${user}:${dayKey(at)}`;

type ParsedInput = Extract<FeedbackInput, { ok: true }>['value'];

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

/** One viewer's own items, newest first. */
export async function feedbackOf(user: string): Promise<FeedbackItem[]> {
  const ids = (await kv.lrange<string>(LIST, 0, FEEDBACK_LIMITS.listCap - 1).catch(() => [] as string[])) ?? [];
  return (await loadMany(ids)).filter(i => i.user === user.toLowerCase());
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
