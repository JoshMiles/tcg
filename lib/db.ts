import { kv as prodKv } from '@vercel/kv';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cookies, headers } from 'next/headers';

// The ONLY place that talks to Vercel KV. Everything else imports `kv` from here (scripts/check-kv-imports.mts fails if a
// file imports '@vercel/kv' directly).
//
// Sandboxes: a request can be pinned to a sandbox, and then every key it touches is transparently prefixed with
// `sbx:<id>:`, so nothing a sandbox does can reach production data. The sandbox comes from (first match wins):
//   1. an explicit override (`runInSandbox`, used to carry the choice into `after()` callbacks and scripts),
//   2. the `x-tcg-sandbox` request header (the overlay sends it when its URL has ?sandbox=<id>),
//   3. the `tcg_sandbox` cookie (set when an admin enters a sandbox in the browser).
// A sandbox id that doesn't exist (deleted, or junk) maps to a dead namespace. Never to production, so a stale cookie
// can't make a "sandbox" request quietly hit real data.

export const SANDBOX_COOKIE = 'tcg_sandbox';
export const SANDBOX_HEADER = 'x-tcg-sandbox';
export const SANDBOX_REGISTRY_KEY = 'sandbox:registry';   // lives in the production namespace, never prefixed
const ID_RE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;
const DEAD = '__missing__';                                 // not matchable by ID_RE, so no real sandbox can collide with it

const override = new AsyncLocalStorage<{ id: string | null }>();

/** Runs `fn` pinned to a sandbox (or to production with `null`), whatever the current request says. */
export function runInSandbox<T>(id: string | null, fn: () => T): T {
  return override.run({ id }, fn);
}

let known: { at: number; ids: Set<string> } | null = null;
async function sandboxExists(id: string): Promise<boolean> {
  if (!known || Date.now() - known.at > 15_000) {
    const list = (await prodKv.get<{ id: string }[]>(SANDBOX_REGISTRY_KEY).catch(() => null)) ?? [];
    known = { at: Date.now(), ids: new Set(list.map(s => s.id)) };
  }
  return known.ids.has(id);
}
/** Forget the cached list of sandboxes (after creating or deleting one). */
export function forgetSandboxCache() { known = null; }

/** The sandbox this request is in, or null for production. Never throws. */
export async function currentSandboxId(): Promise<string | null> {
  const pinned = override.getStore();
  if (pinned) return pinned.id;
  let raw: string | undefined;
  try {
    raw = (await headers()).get(SANDBOX_HEADER) || (await cookies()).get(SANDBOX_COOKIE)?.value || undefined;
  } catch {
    return null; // outside a request (a script): production
  }
  if (!raw) return null;
  if (!ID_RE.test(raw)) return DEAD;
  return (await sandboxExists(raw)) ? raw : DEAD;
}

/** True when the request is in a sandbox (including a dead one). Use it to switch off anything that reaches the outside world. */
export async function inSandbox(): Promise<boolean> {
  return (await currentSandboxId()) !== null;
}

/** Commands whose first argument is a key. Anything else is refused rather than risk an un-prefixed key. */
const KEY_FIRST = new Set([
  'get', 'set', 'getset', 'getdel', 'incr', 'incrby', 'decr', 'exists', 'expire', 'ttl',
  'hget', 'hset', 'hgetall', 'hdel', 'hincrby', 'hexists', 'hlen',
  'lpush', 'rpush', 'lpop', 'rpop', 'lrange', 'ltrim', 'llen',
  'sadd', 'srem', 'smembers', 'sismember', 'scard',
]);

const prefixed = (id: string, key: unknown) => `sbx:${id}:${String(key)}`;

type Kv = typeof prodKv;

/** The KV client every module uses. Same API as @vercel/kv; keys are namespaced when the request is in a sandbox. */
export const kv: Kv = new Proxy(prodKv, {
  get(target, prop) {
    const orig = (target as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof orig !== 'function' || typeof prop !== 'string') return orig;
    return async (...args: unknown[]) => {
      const id = await currentSandboxId();
      if (id === null) return (orig as (...a: unknown[]) => unknown).apply(target, args);
      if (prop === 'del') return (orig as (...a: unknown[]) => unknown).apply(target, args.map(k => prefixed(id, k)));
      if (!KEY_FIRST.has(prop.toLowerCase())) throw new Error(`kv.${prop} is not supported by the namespaced client`);
      return (orig as (...a: unknown[]) => unknown).apply(target, [prefixed(id, args[0]), ...args.slice(1)]);
    };
  },
}) as Kv;

/** The raw production client. Only the sandbox manager (lib/sandbox.ts) and the staff list (lib/staff.ts, real account data that must not change with the sandbox) should use this. */
export { prodKv };
