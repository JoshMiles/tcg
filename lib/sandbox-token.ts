import { createHmac, timingSafeEqual } from 'node:crypto';

// Entering a sandbox is a signed token, `<id>.<hmac>`, not a bare id. The `tcg_sandbox` cookie, the `x-tcg-sandbox` header and the
// overlay's `?sandbox=` all carry it, and `currentSandboxId()` (lib/db.ts) honours only a valid signature. The HMAC covers the id and
// uses a key derived for this purpose from SESSION_SECRET (never the secret itself). Only an admin action mints one.

const key = (): string | null => {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 16 ? `tcg-sandbox-entry:${s}` : null;
};
const mac = (id: string, k: string) => createHmac('sha256', k).update(id).digest('base64url');

/** The token for a sandbox id, or null when SESSION_SECRET is missing or too short. */
export function signSandboxId(id: string): string | null {
  const k = key();
  return k ? `${id}.${mac(id, k)}` : null;
}

/** The sandbox id inside a valid token, or null for anything else (missing, malformed, wrong signature, a bare id). */
export function verifySandboxToken(token: string | null | undefined): string | null {
  const k = key();
  if (!k || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0]) return null;
  const want = Buffer.from(mac(parts[0], k));
  const given = Buffer.from(parts[1]);
  return want.length === given.length && timingSafeEqual(want, given) ? parts[0] : null;
}
