import { prodKv, SANDBOX_REGISTRY_KEY, forgetSandboxCache } from './db';

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
}

export const SOURCE_LABELS: Record<SandboxSource, string> = {
  config: 'A copy of production setup (seasons, packs, cards, settings), no viewers',
  collections: 'A copy of production setup plus every viewer\'s collection',
  empty: 'Empty (you build everything yourself)',
};

const ns = (id: string, key: string) => `sbx:${id}:${key}`;

export async function listSandboxes(): Promise<Sandbox[]> {
  const list = (await prodKv.get<Sandbox[]>(SANDBOX_REGISTRY_KEY)) ?? [];
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
export function makeId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/g, '') || 'sandbox';
  const padded = base.length < 3 ? `${base}-box` : base;
  if (!taken.includes(padded)) return padded;
  for (let i = 2; i < 100; i++) { const id = `${padded.slice(0, 18)}-${i}`; if (!taken.includes(id)) return id; }
  return `${padded.slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Copies one production key into the sandbox. Missing keys are skipped. */
async function copyKey(id: string, key: string): Promise<void> {
  const value = await prodKv.get(key);
  if (value !== null && value !== undefined) await prodKv.set(ns(id, key), value);
}

/** Copies production's setup into the namespace. Never copies secrets or outside-world config (Discord, webhooks, sessions). */
async function cloneFromProduction(id: string, withCollections: boolean): Promise<void> {
  const seasonIds = (await prodKv.get<string[]>('seasons:list')) ?? [];
  const packIds = (await prodKv.get<string[]>('packs:list')) ?? [];
  await copyKey(id, 'seasons:list');
  await copyKey(id, 'packs:list');
  for (const sid of seasonIds) {
    await copyKey(id, `season:${sid}`);
    if (withCollections) {
      const season = await prodKv.get<{ collectionName?: string }>(`season:${sid}`);
      if (season?.collectionName) await copyKey(id, `tcg_${season.collectionName}`);
    }
  }
  for (const pid of packIds) {
    await copyKey(id, `pack:${pid}`);
    await copyKey(id, `pack:${pid}:cards`);
  }
  // Presentation and scoring settings, so the sandbox looks and scores like production.
  for (const key of ['overlay:settings', 'overlay:packprops', 'overlay:presets', 'scoring:settings']) await copyKey(id, key);
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

export async function createSandbox(input: { name: string; source: SandboxSource }): Promise<Sandbox> {
  const list = await listSandboxes();
  const name = input.name.trim().slice(0, 40) || 'Sandbox';
  const sandbox: Sandbox = { id: makeId(name, list.map(s => s.id)), name, createdAt: Date.now(), source: input.source };
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
  for (const pattern of ['tcg_*', 'user:*', 'activity:*', 'twitch_opaque:*', 'lock:*', 'webhooks:queue', 'overlay:clients']) n += await wipeKeys(id, pattern);
  return n;
}

export async function deleteSandbox(id: string): Promise<void> {
  await wipeKeys(id);
  await saveRegistry((await listSandboxes()).filter(s => s.id !== id));
}
