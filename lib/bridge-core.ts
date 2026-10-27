// TCG Bridge, the pure part (ROADMAP 55.0): job and result shapes, pair codes, token hashing, and how a bridge result becomes the
// reply shape lib/mixitup.ts already parses. No database, no network; lib/bridge.ts holds the KV side.
import { createHash, randomInt } from 'crypto';
import { VIEWERS_MAX } from './mixitup-core';

export type JobKind = 'balance' | 'deduct' | 'add' | 'viewers' | 'say' | 'obs-refresh' | 'run-command';
export interface BridgeJob { id: string; kind: JobKind; username?: string; amount?: number; currencyId?: string; text?: string; commandId?: string; args?: string[]; delayMs?: number; at: number }
export interface BridgeResult { id: string; ok: boolean; balance?: number; users?: string[]; error?: string }
export interface BridgeReply { ok: boolean; status: number; body: unknown; error?: string }
export interface BridgeCurrency { id: string; name: string }
/** A Mix It Up command the app reported (ROADMAP 55.6d). */
export interface BridgeCommand { id: string; name: string }
export const COMMANDS_MAX = 500;

export const WAIT_MS = 8000;          // how long a caller waits for a result
export const POLL_MS = 250;           // how often it looks
export const LONG_POLL_MS = 25_000;   // how long /api/bridge/poll holds a request
export const IDLE_POLL_MS = 1000;     // how often an idle long-poll asks the queue
export const JOB_MAX_AGE_MS = 5000;   // a claimed job has at least 3 s left before the waiter (8 s) gives up
export const RESULT_TTL_S = 60;
export const PAIR_TTL_S = 600;
export const TOUCH_EVERY_MS = 10_000;
export const CONNECTED_MS = 60_000;
export const BRIDGE_DID_NOT_ANSWER = 'TCG Bridge did not answer';

const KINDS: readonly string[] = ['balance', 'deduct', 'add', 'viewers', 'say', 'obs-refresh', 'run-command'];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

// No 0/O/1/I/L: a code is read off a screen and typed into the app.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newPairCode = (): string => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
/** What the staff page shows: ABCD-EFGH. */
export const showCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;
/** What a typed code is stored under: upper case, letters and digits only. A wrong shape comes back empty. */
export function normalizeCode(raw: unknown): string {
  const c = typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  return c.length === 8 && [...c].every(ch => ALPHABET.includes(ch)) ? c : '';
}

export const cleanName = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().slice(0, 40) : '') || 'TCG Bridge';

export function isFreshJob(j: unknown, now: number): j is BridgeJob {
  if (!j || typeof j !== 'object') return false;
  const o = j as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.kind === 'string' && KINDS.includes(o.kind) && typeof o.at === 'number' && now - o.at <= JOB_MAX_AGE_MS;
}

/** A result a bridge posted, or null when its shape is wrong. Users are capped like the viewers address. */
export function cleanResult(raw: unknown): BridgeResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID.test(o.id) || typeof o.ok !== 'boolean') return null;
  const r: BridgeResult = { id: o.id, ok: o.ok };
  if (o.balance !== undefined) {
    if (typeof o.balance !== 'number' || !Number.isFinite(o.balance) || o.balance < 0) return null;
    r.balance = Math.floor(o.balance);
  }
  if (o.users !== undefined) {
    if (!Array.isArray(o.users) || !o.users.every(u => typeof u === 'string')) return null;
    r.users = (o.users as string[]).slice(0, VIEWERS_MAX).map(u => u.slice(0, 40));
  }
  if (o.error !== undefined) r.error = String(o.error).slice(0, 200);
  return r;
}

/** The version, currencies and (since TCG Bridge 0.4.0) Mix It Up commands a bridge announces. `commands` is undefined from an older app. Null when the shape is wrong. */
export function cleanHello(raw: unknown): { version: string; currencies: BridgeCurrency[]; commands?: BridgeCommand[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.currencies)) return null;
  const currencies: BridgeCurrency[] = [];
  for (const c of o.currencies.slice(0, 100)) {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    if (typeof x.id === 'string' && x.id.trim() && typeof x.name === 'string' && x.name.trim()) currencies.push({ id: x.id.trim().slice(0, 80), name: x.name.trim().slice(0, 40) });
  }
  let commands: BridgeCommand[] | undefined;
  if (Array.isArray(o.commands)) {
    commands = [];
    for (const c of o.commands.slice(0, COMMANDS_MAX)) {
      const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      if (typeof x.id === 'string' && GUID.test(x.id.trim()) && typeof x.name === 'string' && x.name.trim()) commands.push({ id: x.id.trim().toLowerCase(), name: x.name.trim().slice(0, 100) });
    }
  }
  return { version: typeof o.version === 'string' ? o.version.trim().slice(0, 40) : '', currencies, ...(commands ? { commands } : {}) };
}

/** What TCG Bridge last saw in OBS (ROADMAP 55.6b): only facts, never the overlay address or key. `at` is when the site stored it. */
export interface ObsSnapshot { at: number; connected: boolean; scene: string; overlay: { found: boolean; inProgram: boolean; visible: boolean; sourceName: string } }

/** An OBS report from a bridge (`{ type: 'obs', connected, scene, overlay }`) without `at`, strings capped; null when the shape is wrong. */
export function cleanObs(raw: unknown): Omit<ObsSnapshot, 'at'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const v = (o.overlay && typeof o.overlay === 'object' ? o.overlay : null) as Record<string, unknown> | null;
  if (typeof o.connected !== 'boolean' || typeof o.scene !== 'string' || !v) return null;
  if (typeof v.found !== 'boolean' || typeof v.inProgram !== 'boolean' || typeof v.visible !== 'boolean' || typeof v.sourceName !== 'string') return null;
  return { connected: o.connected, scene: o.scene.slice(0, 100), overlay: { found: v.found, inProgram: v.inProgram, visible: v.visible, sourceName: v.sourceName.slice(0, 100) } };
}

/** A bridge result as the reply callers of the old addresses already read: a 200 with `{ ok, balance | users }`, or a failure with the reason. */
export function replyFromResult(kind: JobKind, r: BridgeResult | null): BridgeReply {
  if (!r) return { ok: false, status: 0, body: null, error: BRIDGE_DID_NOT_ANSWER };
  if (!r.ok) return { ok: false, status: 502, body: { ok: false }, error: r.error || 'TCG Bridge reported a failure' };
  const body = kind === 'balance' ? { ok: true, balance: r.balance } : kind === 'viewers' ? { ok: true, users: r.users } : { ok: true };
  return { ok: true, status: 200, body };
}
