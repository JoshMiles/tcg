// Edge-safe (Web Crypto only; staff-token, access-token and admin-token are imported by the middleware).
//
// One HMAC key per purpose, so a leak or a bug in one signed value cannot forge another. The key is the purpose label plus
// SESSION_SECRET (the secret itself is never a key). Changing a label signs everyone out of that cookie once.

export type SigningPurpose = 'session' | 'staff' | 'access' | 'sandbox-entry' | 'mock-ext';

/** The signing key for one purpose, or null when SESSION_SECRET is missing or shorter than 16 characters. */
export function signingKey(purpose: SigningPurpose, env: Record<string, string | undefined> = process.env): string | null {
  const s = env.SESSION_SECRET;
  return s && s.length >= 16 ? `tcg-${purpose}:${s}` : null;
}

const enc = new TextEncoder();
const digest = async (x: string | Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof x === 'string' ? enc.encode(x) : new Uint8Array(x)));

/**
 * Compares two secrets or signatures without stopping at the first difference or the first difference in length: both sides
 * are hashed to the same size first, so the time taken says nothing about the value or its length.
 */
export async function safeEqual(a: string | Uint8Array, b: string | Uint8Array): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
