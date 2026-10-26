import { isPreview, kv, prodKv } from './db';

// Limits on wrong passwords at the emergency admin login (app/api/auth/login/route.ts). Failures are counted in the
// production namespace, not the namespaced `kv`, so a sandbox cookie or header cannot start a fresh count (a preview
// deployment can only write inside its own namespace, which is also a single shared one there).

/** Wrong passwords allowed per address in one window before the login stops answering that address. */
export const MAX_FAILS = 10;
export const WINDOW_S = 15 * 60;
/** Wrong passwords allowed from all addresses together in one clock hour; after that nobody can use the password login until the hour ends. */
export const MAX_FAILS_PER_HOUR = 20;
const HOUR_S = 60 * 60;

const store = () => (isPreview() ? kv : prodKv);

/** The caller's address from a header the platform sets: `x-real-ip`, else the right-most `x-forwarded-for` entry (the one the nearest proxy appended). The left-most entry is whatever the caller sent. */
export function clientIp(h: Headers): string {
  const real = h.get('x-real-ip')?.trim();
  if (real) return real;
  return h.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean).at(-1) || 'unknown';
}

export const ipFailKey = (ip: string) => `auth:login-fails:${ip}`;
export const hourFailKey = (now = Date.now()) => `auth:login-fails-hour:${Math.floor(now / (HOUR_S * 1000))}`;

/** True when this address, or the whole site, has used up its wrong-password allowance. */
export async function loginLocked(ip: string): Promise<boolean> {
  const [mine, all] = await Promise.all([store().get(ipFailKey(ip)), store().get(hourFailKey())]);
  return (Number(mine) || 0) >= MAX_FAILS || (Number(all) || 0) >= MAX_FAILS_PER_HOUR;
}

/** Counts one wrong password against the address and against the hour. */
export async function recordLoginFail(ip: string): Promise<void> {
  const [mine, all] = await Promise.all([store().incr(ipFailKey(ip)), store().incr(hourFailKey())]);
  await Promise.all([
    mine === 1 ? store().expire(ipFailKey(ip), WINDOW_S) : null,
    all === 1 ? store().expire(hourFailKey(), HOUR_S) : null,
  ]);
}
