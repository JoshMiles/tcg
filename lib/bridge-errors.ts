// TCG Bridge error reports (ROADMAP 57.9), the KV side: the last 50 in one list, a count per day, and the burst post to the System Discord channel.
import { kv } from './db';
import { escapeMd, notifySystem, type SystemNotice } from './discord';
import { BURST_COUNT, BURST_WINDOW_S, ERRORS_KEPT, PART_LABEL, cleanError, errorDay, errorsInLast24h, readErrorList, type BridgeErrorRow } from './bridge-errors-core';

const LIST = 'bridge:errors';
const DAY_TTL_S = 8 * 86_400;
const dayKey = (at: number) => `bridge:errors:day:${errorDay(at)}`;
const WINDOW = 'bridge:errors:window';
const POSTED = 'bridge:errors:posted';

/**
 * Keeps one report from the app. False when the shape is wrong. When the 10th report in 10 minutes arrives, exactly one caller posts to the
 * System channel (SET NX); a single error never posts. `notify` is the Discord sender, replaced by the check.
 */
export async function storeError(raw: unknown, pc: string, now = Date.now(), notify: (o: SystemNotice) => Promise<void> = notifySystem): Promise<boolean> {
  const row = cleanError(raw, pc, now);
  if (!row) return false;
  await kv.lpush(LIST, row);
  await kv.ltrim(LIST, 0, ERRORS_KEPT - 1);
  await kv.incr(dayKey(now));
  await kv.expire(dayKey(now), DAY_TTL_S);
  try { // the Discord post is a nicety: it never fails the report
    const n = await kv.incr(WINDOW);
    if (n === 1) await kv.expire(WINDOW, BURST_WINDOW_S);
    if (n >= BURST_COUNT && (await kv.set(POSTED, 1, { nx: true, ex: BURST_WINDOW_S }))) {
      await notify({ title: '⚠️ TCG Bridge errors', tone: 'bad', text: `${n} errors in the last 10 minutes. The latest: ${PART_LABEL[row.part]}, ${escapeMd(row.message).slice(0, 200)}\nThe list is on Admin > Mix It Up > Connection.` });
    }
  } catch { /* see above */ }
  return true;
}

export async function readErrors(): Promise<BridgeErrorRow[]> {
  return readErrorList(await kv.lrange(LIST, 0, ERRORS_KEPT - 1).catch(() => []));
}

/** Reports in the last 24 hours (at most the 50 kept). */
export async function errorsLast24h(now = Date.now()): Promise<number> {
  return errorsInLast24h(await readErrors(), now);
}

/** The count for each of the last `days` days, today first. */
export async function errorDays(days = 7, now = Date.now()): Promise<{ day: string; count: number }[]> {
  return Promise.all(Array.from({ length: days }, async (_, i) => {
    const at = now - i * 86_400_000;
    return { day: errorDay(at), count: Number(await kv.get(dayKey(at)).catch(() => 0)) || 0 };
  }));
}
