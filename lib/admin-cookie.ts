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
