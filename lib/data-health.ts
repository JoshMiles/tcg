// Data health: how big the stored game data is, so a storage redesign (roadmap 3.2) is decided by numbers, not a hunch.
//
// Each season's collection is ONE JSON value (`tcg_<name>`: { viewer: number[] }) that is read and rewritten whole, under a lock,
// on every pull, trade and upgrade. Trades (`trades:open`, `trades:history`) work the same way. So the size of those values, and how
// long the writers wait for each other, is what decides when this stops being fine. Nothing here changes behaviour.

import { kv } from './db';
import { getCollection, listSeasons } from './kv';

/** A collection value at this size gets a "needs attention" line on the dashboard. */
export const BLOB_WARN_BYTES = 512 * 1024;
/** From here a pull rewrites a couple of MB every time; the storage layout should be revisited (3.2). */
export const BLOB_HIGH_BYTES = 2 * 1024 * 1024;

export type HealthLevel = 'ok' | 'warn' | 'high';

export const healthLevel = (bytes: number): HealthLevel => (bytes >= BLOB_HIGH_BYTES ? 'high' : bytes >= BLOB_WARN_BYTES ? 'warn' : 'ok');

/** Bytes of a value as it is stored (the JSON text, UTF-8). */
export const jsonBytes = (value: unknown): number => (value === null || value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), 'utf8'));

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export interface CollectionSummary {
  bytes: number;
  viewers: number;
  /** Every entry in every viewer's list (one per copy, duplicates included). */
  entries: number;
  largest: { username: string; entries: number } | null;
}

/** Pure: size and shape of one season's collection value. */
export function summarizeCollection(collection: Record<string, number[]>): CollectionSummary {
  let entries = 0;
  let largest: CollectionSummary['largest'] = null;
  const names = Object.keys(collection);
  for (const name of names) {
    const n = Array.isArray(collection[name]) ? collection[name].length : 0;
    entries += n;
    if (!largest || n > largest.entries) largest = { username: name, entries: n };
  }
  return { bytes: jsonBytes(collection), viewers: names.length, entries, largest };
}

/** The dashboard's check text for a collection value (null while it is small). */
export function sizeAttention(seasonName: string, bytes: number): { level: HealthLevel; text: string } | null {
  const level = healthLevel(bytes);
  if (level === 'ok') return null;
  return {
    level,
    text: `${seasonName}'s collection data is ${formatBytes(bytes)}, and every pull, trade and upgrade rewrites all of it. ${level === 'high' ? 'It is large enough that the storage layout should be revisited.' : 'Keep an eye on it as the season grows.'}`,
  };
}

// ---- server side ----

export interface LedgerHealth {
  tracking: boolean;
  /** Copies alive right now (the id index). */
  live: number;
  /** Copies that ended (upgraded, removed) and are kept with their history. */
  retired: number;
  /** Distinct card + version editions that have a serial counter. */
  editions: number;
  /** Total entries across the per-viewer ledger hashes read (a sample of at most OWNER_SAMPLE viewers). */
  ownerEntries: number;
  largestOwner: { username: string; entries: number } | null;
  /** True when there were more viewers than the sample. */
  sampled: boolean;
}

export interface SeasonHealth {
  id: string;
  name: string;
  active: boolean;
  collection: CollectionSummary;
  level: HealthLevel;
  ledger: LedgerHealth;
}

export interface TradesHealth { openCount: number; openBytes: number; historyCount: number; historyBytes: number }

export interface DataHealth {
  at: number;
  seasons: SeasonHealth[];
  trades: TradesHealth;
  activityEvents: number;
}

const OWNER_SAMPLE = 500;
const BATCH = 25;

async function ledgerHealth(collectionName: string, viewers: string[]): Promise<LedgerHealth> {
  const c = collectionName;
  const [init, live, retired, editions] = await Promise.all([
    kv.get(`copies:${c}:init`).catch(() => null), kv.hlen(`copies:${c}:idx`).catch(() => 0),
    kv.hlen(`copies:${c}:ret`).catch(() => 0), kv.hlen(`copies:${c}:n`).catch(() => 0),
  ]);
  const tracking = !!init;
  const sample = tracking ? viewers.slice(0, OWNER_SAMPLE) : [];
  let ownerEntries = 0;
  let largestOwner: LedgerHealth['largestOwner'] = null;
  for (let i = 0; i < sample.length; i += BATCH) {
    const lens = await Promise.all(sample.slice(i, i + BATCH).map(u => kv.hlen(`copies:${c}:o:${u}`).catch(() => 0)));
    lens.forEach((len, j) => {
      const n = Number(len) || 0;
      ownerEntries += n;
      if (!largestOwner || n > largestOwner.entries) largestOwner = { username: sample[i + j], entries: n };
    });
  }
  return { tracking, live: Number(live) || 0, retired: Number(retired) || 0, editions: Number(editions) || 0, ownerEntries, largestOwner, sampled: tracking && viewers.length > OWNER_SAMPLE };
}

/** Measures everything for the Settings page. Reads each published season's collection once; never throws for a missing key. */
export async function loadDataHealth(activeSeasonId?: string | null): Promise<DataHealth> {
  const seasons = (await listSeasons()).filter(s => s.status !== 'draft');
  const rows = await Promise.all(seasons.map(async (s): Promise<SeasonHealth> => {
    const raw = await getCollection(s.collectionName);
    const collection = summarizeCollection(raw);
    return { id: s.id, name: s.name, active: s.id === activeSeasonId, collection, level: healthLevel(collection.bytes), ledger: await ledgerHealth(s.collectionName, Object.keys(raw)) };
  }));
  const [open, history, activityEvents] = await Promise.all([
    kv.get<unknown[]>('trades:open').catch(() => null), kv.get<unknown[]>('trades:history').catch(() => null), kv.llen('activity:log').catch(() => 0),
  ]);
  return {
    at: Date.now(),
    seasons: rows,
    trades: { openCount: open?.length ?? 0, openBytes: jsonBytes(open), historyCount: history?.length ?? 0, historyBytes: jsonBytes(history) },
    activityEvents: Number(activityEvents) || 0,
  };
}
