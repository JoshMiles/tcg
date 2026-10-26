import { clientIp, rateCount, rateHit, rateKey } from './rate-limit';

// Limits on wrong passwords at the emergency admin login (app/api/auth/login/route.ts). Failures are counted by the shared limiter
// (lib/rate-limit.ts), which keeps them in the production namespace so a sandbox cookie or header cannot start a fresh count.

export { clientIp };

/** Wrong passwords allowed per address in one window before the login stops answering that address. */
export const MAX_FAILS = 10;
export const WINDOW_S = 15 * 60;
/** Wrong passwords allowed from all addresses together in one clock hour; after that nobody can use the password login until the hour ends. */
export const MAX_FAILS_PER_HOUR = 20;
const HOUR_S = 60 * 60;

const hourBucket = (now = Date.now()) => String(Math.floor(now / (HOUR_S * 1000)));

export const ipFailKey = (ip: string) => rateKey('login-fails', ip);
export const hourFailKey = (now = Date.now()) => rateKey('login-fails-hour', hourBucket(now));

/** True when this address, or the whole site, has used up its wrong-password allowance. */
export async function loginLocked(ip: string): Promise<boolean> {
  const [mine, all] = await Promise.all([rateCount('login-fails', ip), rateCount('login-fails-hour', hourBucket())]);
  return mine >= MAX_FAILS || all >= MAX_FAILS_PER_HOUR;
}

/** Counts one wrong password against the address and against the hour. Says which limit this one just reached, if any (once per window, so the admin log is told once). */
export async function recordLoginFail(ip: string): Promise<'address' | 'site' | null> {
  const [mine, all] = await Promise.all([rateHit('login-fails', ip, WINDOW_S), rateHit('login-fails-hour', hourBucket(), HOUR_S)]);
  return all === MAX_FAILS_PER_HOUR ? 'site' : mine === MAX_FAILS ? 'address' : null;
}
