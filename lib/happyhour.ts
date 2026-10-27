// Happy hour for paid pulls (ROADMAP 55.4c): KV `mixitup:happyhour`, a live state apart from `mixitup:settings`. It ends by time
// (the key expires with it and an expired one reads as off), so nothing needs a cron. The page and the Stream Deck both start and end it here.
import { kv } from './db';
import { recordAudit } from './audit';
import { activeHappyHour, cleanHappyHourInput, type HappyHour } from './mixitup-core';

const KEY = 'mixitup:happyhour';

/** The running happy hour, or null when none is running (or it has run out). */
export async function getHappyHour(now = Date.now()): Promise<HappyHour | null> {
  return activeHappyHour(await kv.get(KEY).catch(() => null), now);
}

/** "free packs" or "25% off packs": what a happy hour does, for chat and the page. */
export const happyHourWhat = (h: HappyHour): string => (h.kind === 'free' ? 'free packs' : `${h.percent}% off packs`);

/** Starts a happy hour, replacing one that is running. Audit log and Discord admin log get one line (recordAudit posts it once). */
export async function startHappyHour(input: { minutes?: unknown; kind?: unknown; percent?: unknown }, by: string): Promise<{ ok: true; happyHour: HappyHour; message: string } | { ok: false; message: string }> {
  const r = cleanHappyHourInput(input);
  if (!r.ok) return r;
  const happyHour: HappyHour = { ...r.spec, endsAt: Date.now() + r.minutes * 60_000, by };
  await kv.set(KEY, happyHour, { ex: r.minutes * 60 });
  const what = happyHourWhat(happyHour);
  const mins = `${r.minutes} minute${r.minutes === 1 ? '' : 's'}`;
  await recordAudit('everyone', `Happy hour started: ${what}`, `For ${mins}, by ${by}`);
  return { ok: true, happyHour, message: `Happy hour: ${what} for ${mins}.` };
}

/** Ends the happy hour now. `wasOn` = one was running. */
export async function endHappyHour(by: string): Promise<{ wasOn: boolean; message: string }> {
  const wasOn = !!(await getHappyHour());
  await kv.del(KEY);
  if (wasOn) await recordAudit('everyone', 'Happy hour ended', `By ${by}`);
  return { wasOn, message: wasOn ? 'Happy hour is over. Packs cost the normal price again.' : 'There was no happy hour running.' };
}
