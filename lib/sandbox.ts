import { randomBytes } from 'node:crypto';
import { prodKv, SANDBOX_REGISTRY_KEY, RESERVED_IDS, PREVIEW_ID, forgetSandboxCache } from './db';

// Sandboxes: isolated copies of the app's data for testing (upgrades, and later trading) without touching production.
// A sandbox is a key namespace (`sbx:<id>:*`, see lib/db.ts) plus an entry in the registry below. This module is the only
// code that uses the raw production client: it creates a sandbox by copying the setup (seasons, packs, cards, overlay and
// scoring settings, optionally viewer collections) INTO the namespace, and wipes a namespace with SCAN. It never writes
// to an un-prefixed key other than the registry itself.

export type SandboxSource = 'config' | 'collections' | 'empty';

export interface Sandbox {
  id: string;
  name: string;
  createdAt: number;
  /** What it was created from; "reset" starts over from the same source. */
  source: SandboxSource;
  /** Last time an admin action ran in it (set by touchSandbox). */
  lastUsedAt?: number;
  /** When set, it is deleted automatically once this time has passed (see sweepExpiredSandboxes). */
  expiresAt?: number;
}

/** Every sandbox is a full namespace of the shared database, so the number is capped. */
export const MAX_SANDBOXES = 10;
export const EXPIRY_CHOICES = [0, 7, 30] as const; // days; 0 = never

export const SOURCE_LABELS: Record<SandboxSource, string> = {
  config: 'A copy of production setup (seasons, packs, cards, settings), no viewers',
  collections: 'A copy of production setup plus every viewer\'s collection',
  empty: 'Empty (you build everything yourself)',
};

const ns = (id: string, key: string) => `sbx:${id}:${key}`;

export async function listSandboxes(): Promise<Sandbox[]> {
  const list = ((await prodKv.get<Sandbox[]>(SANDBOX_REGISTRY_KEY)) ?? []).filter(s => !RESERVED_IDS.includes(s.id));
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSandbox(id: string): Promise<Sandbox | null> {
  return (await listSandboxes()).find(s => s.id === id) ?? null;
}

async function saveRegistry(list: Sandbox[]) {
  await prodKv.set(SANDBOX_REGISTRY_KEY, list);
  forgetSandboxCache();
}

/** A URL-safe id from a name, unique among existing sandboxes. */
export function makeId(name: string, takenIds: string[]): string {
  const taken = [...takenIds, ...RESERVED_IDS]; // a reserved id (the preview namespace) can never be handed out
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16).replace(/-+$/g, '') || 'sandbox';
  // Readable slug plus a random base36 suffix, so an id can't be guessed from the name.
  for (;;) {
    const id = `${base}-${randomBytes(6).readUIntBE(0, 6).toString(36).padStart(6, '0').slice(-6)}`;
    if (!taken.includes(id)) return id;
  }
}

/** Copies one production key into the sandbox. Missing keys are skipped. */
async function copyKey(id: string, key: string): Promise<void> {
  const value = await prodKv.get(key);
  if (value !== null && value !== undefined) await prodKv.set(ns(id, key), value);
}

/** Copies one season's collection into the sandbox as a hash (`coll:<name>`). Production's season may still be the old string (not yet used since the move to hashes); it is copied in the hash layout either way. */
async function copyCollection(id: string, c: string): Promise<void> {
  let rec = await prodKv.hgetall<Record<string, number[]>>(`coll:${c}`);
  if (!rec) {
    const old = await prodKv.get<Record<string, number[]>>(`tcg_${c}`);
    rec = old ? Object.fromEntries(Object.entries(old).filter(([, cards]) => Array.isArray(cards) && cards.length > 0)) : null;
  }
  const names = Object.keys(rec ?? {});
  await prodKv.del(ns(id, `coll:${c}`), ns(id, `tcg_${c}`)); // a copy replaces what was there, as the old single-value copy did
  for (let i = 0; i < names.length; i += 200) await prodKv.hset(ns(id, `coll:${c}`), Object.fromEntries(names.slice(i, i + 200).map(n => [n, rec![n]])));
}

/** Settings keys copied from production into a sandbox (or the preview namespace), on top of the seasons / packs / cards. One list for both. */
export const SETUP_SETTINGS_KEYS = ['overlay:settings', 'overlay:packprops', 'overlay:presets', 'scoring:settings'] as const;

/** Copies production's setup into the namespace. Never copies secrets or outside-world config (Discord, webhooks, sessions). */
export async function cloneFromProduction(id: string, withCollections: boolean): Promise<void> {
  const seasonIds = (await prodKv.get<string[]>('seasons:list')) ?? [];
  const packIds = (await prodKv.get<string[]>('packs:list')) ?? [];
  await copyKey(id, 'seasons:list');
  await copyKey(id, 'packs:list');
  for (const sid of seasonIds) {
    await copyKey(id, `season:${sid}`);
    if (withCollections) {
      const season = await prodKv.get<{ collectionName?: string }>(`season:${sid}`);
      if (season?.collectionName) await copyCollection(id, season.collectionName);
    }
  }
  for (const pid of packIds) {
    await copyKey(id, `pack:${pid}`);
    await copyKey(id, `pack:${pid}:cards`);
  }
  // Presentation and scoring settings, so the sandbox looks and scores like production.
  for (const key of SETUP_SETTINGS_KEYS) await copyKey(id, key);
}

/** Copies production's setup into the preview namespace (preview deployments only; `prodKv` is fenced to that namespace there). */
export async function seedPreviewFromProduction(withCollections: boolean): Promise<void> {
  await cloneFromProduction(PREVIEW_ID, withCollections);
}

/** Deletes keys in a namespace matching `pattern` (default: all of them) using SCAN. Returns how many were removed. */
export async function wipeKeys(id: string, pattern = '*'): Promise<number> {
  let cursor: string | number = 0;
  let removed = 0;
  do {
    const [next, keys] = (await prodKv.scan(cursor, { match: ns(id, pattern), count: 200 })) as [string | number, string[]];
    // Belt and braces: only ever delete keys that really are inside this sandbox's namespace.
    const mine = keys.filter(k => k.startsWith(`sbx:${id}:`));
    if (mine.length > 0) { await prodKv.del(...mine); removed += mine.length; }
    cursor = next;
  } while (String(cursor) !== '0');
  return removed;
}

export async function createSandbox(input: { name: string; source: SandboxSource; expiresInDays?: number }): Promise<Sandbox> {
  const list = await listSandboxes();
  if (list.length >= MAX_SANDBOXES) throw new Error(`You already have ${MAX_SANDBOXES} sandboxes. Delete one first.`);
  const name = input.name.trim().slice(0, 40) || 'Sandbox';
  const days = (EXPIRY_CHOICES as readonly number[]).includes(input.expiresInDays ?? 0) ? input.expiresInDays ?? 0 : 0;
  const now = Date.now();
  const sandbox: Sandbox = { id: makeId(name, list.map(s => s.id)), name, createdAt: now, lastUsedAt: now, source: input.source, ...(days > 0 ? { expiresAt: now + days * 86_400_000 } : {}) };
  await saveRegistry([...list, sandbox]);
  if (input.source !== 'empty') await cloneFromProduction(sandbox.id, input.source === 'collections');
  return sandbox;
}

/** Wipes the sandbox and copies production's current setup in again. */
export async function resetSandbox(id: string): Promise<void> {
  const sandbox = await getSandbox(id);
  if (!sandbox) throw new Error('Sandbox not found.');
  await wipeKeys(id);
  if (sandbox.source !== 'empty') await cloneFromProduction(id, sandbox.source === 'collections');
}

/** Removes only viewer data (collections, profiles, activity, logins), keeping the sandbox's setup. */
export async function resetTestData(id: string): Promise<number> {
  let n = 0;
  for (const pattern of ['tcg_*', 'coll:*', 'collmig', 'user:*', 'activity:*', 'twitch_opaque:*', 'lock:*', 'webhooks:queue', 'overlay:clients']) n += await wipeKeys(id, pattern);
  return n;
}

export async function deleteSandbox(id: string): Promise<void> {
  await wipeKeys(id);
  await saveRegistry((await listSandboxes()).filter(s => s.id !== id));
}

/** Records that something was done in a sandbox (best effort: a failed write must never block the action itself). */
export async function touchSandbox(id: string, now = Date.now()): Promise<void> {
  try {
    const list = await listSandboxes();
    if (!list.some(s => s.id === id)) return;
    await saveRegistry(list.map(s => (s.id === id ? { ...s, lastUsedAt: now } : s)));
  } catch { /* ignore */ }
}

/** Sets (days > 0) or clears (0) the automatic deletion date, counted from now. */
export async function setSandboxExpiry(id: string, days: number, now = Date.now()): Promise<void> {
  const list = await listSandboxes();
  await saveRegistry(list.map(s => {
    if (s.id !== id) return s;
    const { expiresAt: _drop, ...rest } = s;
    void _drop;
    return days > 0 ? { ...rest, expiresAt: now + days * 86_400_000 } : rest;
  }));
}

/** Pure: which sandboxes have passed their expiry. */
export function expiredSandboxes(list: Sandbox[], now = Date.now()): Sandbox[] {
  return list.filter(s => typeof s.expiresAt === 'number' && s.expiresAt <= now);
}

/** Deletes every sandbox past its expiry (called lazily when the Sandbox page loads; there is no background job). Returns their names. */
export async function sweepExpiredSandboxes(now = Date.now()): Promise<string[]> {
  const gone = expiredSandboxes(await listSandboxes(), now);
  for (const s of gone) await deleteSandbox(s.id);
  return gone.map(s => s.name);
}

/** How many keys a sandbox holds (a rough size for the list). */
export async function countKeys(id: string): Promise<number> {
  let cursor: string | number = 0;
  let n = 0;
  do {
    const [next, keys] = (await prodKv.scan(cursor, { match: ns(id, '*'), count: 500 })) as [string | number, string[]];
    n += keys.filter(k => k.startsWith(`sbx:${id}:`)).length;
    cursor = next;
  } while (String(cursor) !== '0');
  return n;
}

/** Reads one key from production (null when absent). Used only to compare a sandbox against it. */
export const readProduction = (key: string) => prodKv.get(key);
/** Reads one key from inside a sandbox's namespace. */
export const readSandboxKey = (id: string, key: string) => prodKv.get(ns(id, key));
