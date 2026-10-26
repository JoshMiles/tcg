import { kv as prodKv } from '@vercel/kv';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { verifySandboxToken } from './sandbox-token';

// The ONLY place that talks to Vercel KV. Everything else imports `kv` from here (scripts/check-kv-imports.mts fails if a
// file imports '@vercel/kv' directly).
//
// Sandboxes: a request can be pinned to a sandbox, and then every key it touches is transparently prefixed with
// `sbx:<id>:`, so nothing a sandbox does can reach production data. The sandbox comes from (first match wins):
//   1. an explicit override (`runInSandbox`, used to carry the choice into `after()` callbacks and scripts),
//   2. the `x-tcg-sandbox` request header (the overlay sends it when its URL has ?sandbox=<token>),
//   3. the `tcg_sandbox` cookie (set when an admin enters a sandbox in the browser).
// Header and cookie carry a signed token (lib/sandbox-token.ts), never a bare id. Anything that isn't a valid token for an
// existing sandbox (junk, unsigned, tampered, deleted) maps to a dead namespace. Never to production, so a stale cookie
// can't make a "sandbox" request quietly hit real data.
//
// Preview deployments (VERCEL_ENV=preview) share the production store, so they are forced into one reserved namespace,
// `sbx:preview:*`: the sandbox choice from cookie / header / override is ignored, and so is "outside a request" (which
// would otherwise mean production). The raw `prodKv` is fenced there too: it can still read production (the staff list,
// the sandbox seeding), but any write to a key outside `sbx:preview:` throws.

export const SANDBOX_COOKIE = 'tcg_sandbox';
export const SANDBOX_HEADER = 'x-tcg-sandbox';
export const SANDBOX_REGISTRY_KEY = 'sandbox:registry';   // lives in the production namespace, never prefixed
const ID_RE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;
export const PREVIEW_ID = 'preview';                        // reserved: the namespace every preview deployment is pinned to
export const RESERVED_IDS: readonly string[] = [PREVIEW_ID];
const DEAD = '__missing__';                                 // not matchable by ID_RE, so no real sandbox can collide with it

/** True on a Vercel preview deployment. Read per call (not at load) so scripts can switch it. */
export const isPreview = () => process.env.VERCEL_ENV === 'preview';

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
  if (isPreview()) return PREVIEW_ID;
  const pinned = override.getStore();
  if (pinned) return pinned.id;
  let raw: string | undefined;
  try {
    raw = (await headers()).get(SANDBOX_HEADER) || (await cookies()).get(SANDBOX_COOKIE)?.value || undefined;
  } catch {
    return null; // outside a request (a script): production
  }
  return resolveSandbox(raw);
}

/** Maps a header / cookie value to a sandbox id: nothing is production; anything but a valid signed token for an existing sandbox is the dead namespace. */
export async function resolveSandbox(raw: string | undefined): Promise<string | null> {
  if (!raw) return null;
  const id = verifySandboxToken(raw);
  return id && ID_RE.test(id) && (await sandboxExists(id)) ? id : DEAD;
}

/**
 * Request-scoped memo for a KV reader (React `cache`): one read per request, sandbox and arguments, so a page that asks for the same
 * thing from several components reads it once. Outside a render (an action, a route handler, a script) it calls straight through, so a
 * write followed by a read in the same call is never stale. Arguments must be primitives. Never put a write path on it.
 * The sandbox id is part of the key because `runInSandbox` can read another namespace inside one render.
 */
export function requestCached<A extends (string | number | boolean | null)[], R>(read: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const memo = cache((_sandbox: string | null, ...args: A) => read(...args));
  return async (...args: A) => memo(await currentSandboxId(), ...args);
}

/** True when the request is in a sandbox (including a dead one). Use it to switch off anything that reaches the outside world. */
export async function inSandbox(): Promise<boolean> {
  return (await currentSandboxId()) !== null;
}

/** Commands whose first argument is a key (`del` takes several keys and is handled on its own below). Anything else is refused rather than risk an un-prefixed key. */
const KEY_FIRST = new Set([
  'get', 'set', 'getset', 'getdel', 'incr', 'incrby', 'decr', 'exists', 'expire', 'ttl',
  'hget', 'hmget', 'hset', 'hsetnx', 'hgetall', 'hdel', 'hincrby', 'hexists', 'hlen',
  'lpush', 'rpush', 'lpop', 'rpop', 'lrange', 'ltrim', 'llen',
  'sadd', 'srem', 'smembers', 'sismember', 'scard',
]);

const prefixed = (id: string, key: unknown) => `sbx:${id}:${String(key)}`;

type Kv = typeof prodKv;

/** Commands that only read. On a preview any other command is treated as a write and must stay inside `sbx:preview:`. */
const READ_ONLY = new Set(['get', 'mget', 'exists', 'ttl', 'type', 'strlen', 'hget', 'hgetall', 'hlen', 'hexists', 'hkeys', 'hvals', 'hmget',
  'lrange', 'llen', 'lindex', 'smembers', 'sismember', 'scard', 'scan', 'zrange', 'zscore', 'zcard', 'dbsize']);
const PREVIEW_PREFIX = `sbx:${PREVIEW_ID}:`;

/**
 * The raw client with the preview fence: on a preview deployment, writes outside `sbx:preview:` throw and pipelines are
 * refused; everywhere else it is the plain client. Reads always pass through.
 */
const fenced: Kv = new Proxy(prodKv, {
  get(target, prop) {
    const orig = (target as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof orig !== 'function' || typeof prop !== 'string') return orig;
    const name = prop.toLowerCase();
    return (...args: unknown[]) => {
      if (isPreview() && !READ_ONLY.has(name)) {
        if (name === 'pipeline' || name === 'multi') return Promise.reject(new Error(`kv.${prop} is not available on a preview deployment`));
        const keys = name === 'del' || name === 'unlink' || name === 'rename' || name === 'renamenx' ? args : name === 'eval' ? (args[1] as unknown[]) : [args[0]];
        if (!keys.every(k => typeof k === 'string' && k.startsWith(PREVIEW_PREFIX)))
          return Promise.reject(new Error(`Blocked: a preview deployment may not write outside ${PREVIEW_PREFIX}* (kv.${prop})`));
      }
      return (orig as (...a: unknown[]) => unknown).apply(target, args);
    };
  },
}) as Kv;

/** The KV client every module uses. Same API as @vercel/kv; keys are namespaced when the request is in a sandbox. */
export const kv: Kv = new Proxy(fenced, {
  get(target, prop) {
    let orig: unknown;
    try {
      orig = (target as unknown as Record<string | symbol, unknown>)[prop];
    } catch (e) {
      // No KV variables (the CI build): @vercel/kv throws on first use. Resolve the request first, so a prerender
      // stops at the cookie read as dynamic instead of failing the build; the call itself still throws.
      if (typeof prop !== 'string') throw e;
      return async () => { await currentSandboxId(); throw e; };
    }
    if (typeof orig !== 'function' || typeof prop !== 'string') return orig;
    return async (...args: unknown[]) => {
      const id = await currentSandboxId();
      if (id === null) return (orig as (...a: unknown[]) => unknown).apply(target, args);
      if (prop === 'mget') return (orig as (...a: unknown[]) => unknown).apply(target, args.flat().map(k => prefixed(id, k)));
      if (prop === 'del') return (orig as (...a: unknown[]) => unknown).apply(target, args.map(k => prefixed(id, k)));
      if (prop === 'rename') return (orig as (...a: unknown[]) => unknown).apply(target, args.map(k => prefixed(id, k))); // both the source and the destination are keys
      if (prop === 'eval') return (orig as (...a: unknown[]) => unknown).apply(target, [args[0], (args[1] as unknown[]).map(k => prefixed(id, k)), ...args.slice(2)]); // (script, keys, argv): only the keys are namespaced
      if (!KEY_FIRST.has(prop.toLowerCase())) throw new Error(`kv.${prop} is not supported by the namespaced client`);
      return (orig as (...a: unknown[]) => unknown).apply(target, [prefixed(id, args[0]), ...args.slice(1)]);
    };
  },
}) as Kv;

/** The raw production client. Only the sandbox manager (lib/sandbox.ts) and the staff list (lib/staff.ts, real account data that must not change with the sandbox) should use this. */
export { fenced as prodKv };
