// When each incoming secret last worked, and on which route (ROADMAP 51.11). One small hash in the production namespace,
// field = secret name, value {at, route}. Never the secret itself. Recording is a side effect: fire-and-forget, never throws,
// never awaited by the request. A hot route (the overlay asks every 2 s) writes at most once a minute per instance.
import { prodKv } from './db';

const SECRET_USED_KEY = 'secret:lastused';
const THROTTLE_MS = 60_000;
// Preview deployments share the production store, so they write a fenced key and never touch production's record.
const key = () => (process.env.VERCEL_ENV === 'preview' ? 'sbx:preview:secret:lastused' : SECRET_USED_KEY);

/** The secrets that are recorded, as shown on Admin Settings. */
export const RECORDED_SECRETS = [
  { name: 'CRON_SECRET', label: 'Cron secret' },
  { name: 'INCOMING_WEBHOOK_SECRET', label: 'Incoming webhook secret' },
  { name: 'OVERLAY_KEY', label: 'Overlay key' },
  { name: 'TWITCH_EXTENSION_SECRET', label: 'Twitch extension secret' },
] as const;

export interface SecretUse { at: number; route: string }

/** Pure throttle: write when nothing was written yet or the last write is a minute old. */
export function dueToRecord(lastWrite: number | undefined, now: number): boolean {
  return lastWrite === undefined || now - lastWrite >= THROTTLE_MS;
}

const lastWrite = new Map<string, number>();

/** Notes that `name` just worked on `route`. Call it after the check passed; it returns at once. */
export function noteSecretUsed(name: string, route: string, now = Date.now()): void {
  if (!dueToRecord(lastWrite.get(name), now)) return;
  lastWrite.set(name, now);
  prodKv.hset(key(), { [name]: { at: now, route } }).catch(() => { /* the request must not notice */ });
}

/** Test hook: forget the in-memory throttle. */
export function resetSecretUsedThrottle(): void { lastWrite.clear(); }

/** Every recorded use, keyed by secret name. Empty when nothing was recorded or the read fails. */
export async function readSecretsLastUsed(): Promise<Record<string, SecretUse>> {
  try {
    const all = (await prodKv.hgetall<Record<string, SecretUse>>(key())) ?? {};
    const out: Record<string, SecretUse> = {};
    for (const [name, v] of Object.entries(all)) if (v && typeof v.at === 'number' && typeof v.route === 'string') out[name] = { at: v.at, route: v.route };
    return out;
  } catch {
    return {};
  }
}
