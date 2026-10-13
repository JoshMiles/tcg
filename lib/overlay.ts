import { kv } from './db';
import { queueLength } from './webhooks';

// Which OBS overlays (overlay.html browser sources) are currently open, and. When OBS lets the
// page read it, whether OBS is streaming/recording. Each overlay instance sends a heartbeat every
// ~10s with a random id; we keep them in one KV hash and treat a client as connected while its
// last heartbeat is recent.
const KEY = 'overlay:clients';
export const HEARTBEAT_MS = 10_000;
const CONNECTED_MS = 25_000;         // tolerates one missed heartbeat
const PRUNE_AFTER_MS = 10 * 60_000;  // forget clients that vanished long ago

export interface OverlayClient {
  id: string;
  at: number;                  // last heartbeat (ms)
  streaming: boolean | null;   // null = OBS didn't tell us (no "read status" permission, or not OBS)
  recording: boolean | null;
  obs: boolean;                // looks like an OBS browser source (vs. a normal browser tab)
  dev: boolean;                // opened with ?dev
}

export interface OverlayStatus {
  connected: number;
  clients: OverlayClient[];    // connected only
  streaming: boolean | null;   // any connected overlay reports streaming; null if none can tell
  recording: boolean | null;
  lastSeen: number | null;     // most recent heartbeat from anyone, even if disconnected now
  queued: number;              // events waiting for an overlay to pick up
}

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function isValidClientId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

export async function recordHeartbeat(c: Omit<OverlayClient, 'at'>): Promise<void> {
  await kv.hset(KEY, { [c.id]: { ...c, at: Date.now() } satisfies OverlayClient });
  // Occasionally drop clients that stopped reporting (keeps the hash tiny without an extra read every time).
  if (Math.random() < 0.1) {
    const all = (await kv.hgetall<Record<string, OverlayClient>>(KEY)) ?? {};
    const stale = Object.entries(all).filter(([, v]) => Date.now() - v.at > PRUNE_AFTER_MS).map(([k]) => k);
    if (stale.length) await kv.hdel(KEY, ...stale);
  }
}

export async function getOverlayStatus(): Promise<OverlayStatus> {
  const [all, queued] = await Promise.all([
    kv.hgetall<Record<string, OverlayClient>>(KEY),
    queueLength().catch(() => 0),
  ]);
  const clients = Object.values(all ?? {});
  const now = Date.now();
  const connected = clients.filter(c => now - c.at <= CONNECTED_MS).sort((a, b) => b.at - a.at);

  // A flag is true if any connected overlay says so, false if some say false, null if nobody can tell.
  const combine = (pick: (c: OverlayClient) => boolean | null): boolean | null => {
    const known = connected.map(pick).filter((v): v is boolean => v !== null);
    if (known.length === 0) return null;
    return known.some(Boolean);
  };

  return {
    connected: connected.length,
    clients: connected,
    streaming: combine(c => c.streaming),
    recording: combine(c => c.recording),
    lastSeen: clients.length ? Math.max(...clients.map(c => c.at)) : null,
    queued,
  };
}
