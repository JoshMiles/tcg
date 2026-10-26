import { kv, runInSandbox } from './db';
import { getCollection, listSeasons, saveCollection, getUserProfiles, saveUserProfile, deleteUserProfile, withCollectionLock } from './kv';
import { listOpenTrades, tradeHistory } from './trades';
import type { UserProfile } from './types';

// A short history of what an admin did inside a sandbox, plus a one-step undo for the last change to viewer data.
// Both live INSIDE the sandbox's namespace (via `kv`, so a reset or delete wipes them with everything else) and never
// touch production. Undo restores collections (and the profiles of the viewers an action named); it refuses when trades
// have happened since, because escrowed cards would then be counted twice.

const LOG_KEY = 'sandbox:log';
const UNDO_KEY = 'sandbox:undo';
export const LOG_LIMIT = 60;

export interface LogEntry { at: number; label: string; detail?: string; undoable: boolean }

interface UndoPoint {
  at: number;
  label: string;
  collections: Record<string, Record<string, number[]>>;       // collection name -> contents before the change
  profiles: Record<string, UserProfile | null>;                // viewers the action named -> profile before the change
  tradeStamp: string;
}

/** A fingerprint of the trade state; if it changed since a snapshot, restoring collections would break escrow. */
export async function tradeStamp(): Promise<string> {
  const [open, history] = await Promise.all([listOpenTrades().catch(() => []), tradeHistory().catch(() => [])]);
  return `${open.map(t => `${t.id}:${t.status}`).join(',')}|${history.length}`;
}

export function appendLog(list: LogEntry[], entry: LogEntry): LogEntry[] {
  return [entry, ...list].slice(0, LOG_LIMIT);
}

export function getLog(sandboxId: string): Promise<LogEntry[]> {
  return runInSandbox(sandboxId, async () => (await kv.get<LogEntry[]>(LOG_KEY)) ?? []);
}

export function getUndoLabel(sandboxId: string): Promise<{ label: string; at: number } | null> {
  return runInSandbox(sandboxId, async () => {
    const u = await kv.get<UndoPoint>(UNDO_KEY);
    return u ? { label: u.label, at: u.at } : null;
  });
}

/** Writes a log line (best effort). */
export function logEvent(sandboxId: string, label: string, detail?: string, undoable = false): Promise<void> {
  return runInSandbox(sandboxId, async () => {
    try { await kv.set(LOG_KEY, appendLog((await kv.get<LogEntry[]>(LOG_KEY)) ?? [], { at: Date.now(), label, detail, undoable })); } catch { /* the log must never block an action */ }
  });
}

async function takeSnapshot(label: string, usernames: string[]): Promise<UndoPoint> {
  const seasons = await listSeasons();
  const collections: UndoPoint['collections'] = {};
  for (const s of seasons) collections[s.collectionName] = await getCollection(s.collectionName);
  const profiles: UndoPoint['profiles'] = {};
  const got = await getUserProfiles(usernames);
  for (const u of usernames) profiles[u] = got.get(u.toLowerCase()) ?? null;
  return { at: Date.now(), label, collections, profiles, tradeStamp: await tradeStamp() };
}

/**
 * Runs a change to viewer data, remembering how things were so the last change can be undone, and logs it.
 * The snapshot is only kept if `fn` succeeds. `describe` turns the result into the log detail.
 */
export async function withUndo<T>(sandboxId: string, label: string, usernames: string[], fn: () => Promise<T>, describe?: (r: T) => string): Promise<T> {
  const before = await runInSandbox(sandboxId, () => takeSnapshot(label, usernames));
  const result = await fn();
  await runInSandbox(sandboxId, async () => { try { await kv.set(UNDO_KEY, before); } catch { /* ignore */ } });
  await logEvent(sandboxId, label, describe?.(result), true);
  return result;
}

/** Restores the state from before the last viewer-data change. Returns what was undone, or why it could not be. */
export function undoLast(sandboxId: string): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  return runInSandbox(sandboxId, async () => {
    const point = await kv.get<UndoPoint>(UNDO_KEY);
    if (!point) return { ok: false as const, error: 'Nothing to undo.' };
    if ((await tradeStamp()) !== point.tradeStamp) return { ok: false as const, error: 'Trades have happened since that change, and undoing it would count escrowed cards twice. Cancel or finish the trades, or reset the viewer data.' };
    for (const [name, data] of Object.entries(point.collections)) await withCollectionLock(name, () => saveCollection(name, data));
    for (const [user, profile] of Object.entries(point.profiles)) { if (profile) await saveUserProfile(profile); else await deleteUserProfile(user); }
    await kv.del(UNDO_KEY);
    await logEvent(sandboxId, `Undid: ${point.label}`);
    return { ok: true as const, label: point.label };
  });
}
