// The emergency cookie's generation, stored in KV so a sign-out kills every copy of the cookie, not only the
// browser that sent it. The signing key itself is ADMIN_COOKIE_SECRET (lib/admin-token.ts), never this row
// and never ADMIN_SECRET. Lives in the production namespace, like the staff list: a sandbox must not be able
// to keep a cookie the live site has revoked. Preview writes its own fenced key (adminGenKey).
import { prodKv } from './db';
import { adminGenKey, parseAdminGen } from './admin-token';

/** The current generation, or null when nobody has signed in with the password yet. */
export async function currentAdminGen(): Promise<number | null> {
  try {
    return parseAdminGen(await prodKv.get(adminGenKey()));
  } catch {
    return null;
  }
}

/** The generation to stamp on a new cookie. Creates generation 1 the first time. */
export async function ensureAdminGen(): Promise<number> {
  const key = adminGenKey();
  const have = parseAdminGen(await prodKv.get(key));
  if (have) return have;
  await prodKv.set(key, 1, { nx: true });
  return parseAdminGen(await prodKv.get(key)) ?? 1;
}

/** Invalidates every emergency cookie already issued. The next password login stamps the new generation. */
export async function bumpAdminGen(): Promise<void> {
  await prodKv.incr(adminGenKey());
}

/** KV key for the time of the last emergency password login. Fenced like the generation, so a preview never touches production's. */
const lastLoginKey = () => adminGenKey().replace('auth-gen', 'last-login');

/** One timestamp, overwritten at each emergency login (the Discord admin log has the history). Never throws: it must not block the login. */
export async function recordEmergencyLogin(now = Date.now()): Promise<void> {
  try { await prodKv.set(lastLoginKey(), now); } catch { /* the login still succeeds */ }
}

/** When the emergency password last signed anyone in, or null if it never has (or before this was recorded). */
export async function lastEmergencyLogin(): Promise<number | null> {
  try {
    const v = Number(await prodKv.get(lastLoginKey()));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
