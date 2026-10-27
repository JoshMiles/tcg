// Up and down history per stream (ROADMAP 55.11), the KV side: one key, `bridge:uptime`, the last 10 streams (pure parts in bridge-uptime-core.ts).
// Written only when a part changes state. Every function swallows errors: history is a nicety and never breaks a report or a poll.
import { kv } from './db';
import { closeStream, openStream, readUptimeList, recordChange, type UptimePart, type UptimeStream } from './bridge-uptime-core';

const KEY = 'bridge:uptime';

export async function readUptime(): Promise<UptimeStream[]> {
  try { return readUptimeList(await kv.get(KEY)); } catch { return []; }
}
const save = (list: UptimeStream[]) => kv.set(KEY, list);

export async function openUptimeStream(at = Date.now()): Promise<void> {
  try { await save(openStream(await readUptime(), at)); } catch { /* a nicety */ }
}
export async function closeUptimeStream(at = Date.now()): Promise<void> {
  try { const next = closeStream(await readUptime(), at); if (next) await save(next); } catch { /* a nicety */ }
}
export async function noteUptime(part: UptimePart, up: boolean, at = Date.now()): Promise<void> {
  try { const next = recordChange(await readUptime(), part, up, at); if (next) await save(next); } catch { /* a nicety */ }
}
