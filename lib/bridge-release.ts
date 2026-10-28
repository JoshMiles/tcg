// The newest TCG Bridge release on GitHub (ROADMAP 56.2), for the admin dashboard and the Mix It Up Connection tab. The first half is pure.
import { kv } from './db';

export const BRIDGE_REPO = 'JoshMiles/tcg';
export interface BridgeRelease { version: string; date: string; commit: string; url: string; installerUrl: string }

/** "bridge-v0.12.0" or "v0.12.0" or "0.12.0" to [0, 12, 0], else null. */
function parseVersion(v: string): number[] | null {
  const m = /^(?:bridge-)?v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative when a is older than b, 0 when equal, positive when newer; null when either is not a x.y.z version. */
export function compareSemver(a: string, b: string): number | null {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return null;
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** The newest published, non-prerelease `bridge-v` release in a GitHub releases answer (by version, not by list order), or null. The commit is the release's target when that is a sha, else the "Commit:" link the release workflow writes in the notes. */
export function pickBridgeRelease(list: unknown): BridgeRelease | null {
  if (!Array.isArray(list)) return null;
  let best: BridgeRelease | null = null;
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const tag = typeof o.tag_name === 'string' ? o.tag_name : '';
    if (o.draft === true || o.prerelease === true || !tag.startsWith('bridge-v') || !parseVersion(tag)) continue;
    const version = tag.slice('bridge-v'.length);
    if (best && (compareSemver(version, best.version) ?? 0) <= 0) continue;
    const target = typeof o.target_commitish === 'string' ? o.target_commitish.trim().toLowerCase() : '';
    const fromNotes = /\/commit\/([0-9a-f]{7,40})\b/i.exec(typeof o.body === 'string' ? o.body : '')?.[1]?.toLowerCase() ?? '';
    const assets = Array.isArray(o.assets) ? o.assets : [];
    const exe = assets.find((a): a is { name: string; browser_download_url: string } => !!a && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.exe') && typeof a.browser_download_url === 'string');
    best = {
      version,
      date: typeof o.published_at === 'string' ? o.published_at.slice(0, 10) : '',
      commit: /^[0-9a-f]{40}$/.test(target) ? target : fromNotes,
      url: typeof o.html_url === 'string' ? o.html_url : `https://github.com/${BRIDGE_REPO}/releases/tag/${tag}`,
      installerUrl: exe?.browser_download_url ?? '',
    };
  }
  return best;
}

/** The one line that compares what runs with what is out. Empty when there is nothing to say. */
export function bridgeVersionLine(running: string, latest: string | null): string {
  if (!running) return latest ? `Latest TCG Bridge is ${latest}.` : '';
  if (!latest) return `${running} running.`;
  const c = compareSemver(running, latest);
  if (c === null) return `${running} running, ${latest} available.`;
  return c < 0 ? `Out of date: ${running} running, ${latest} available.` : `Up to date: ${running} running.`;
}

const CACHE = 'bridge:release';
const FRESH_MS = 10 * 60_000, RETRY_MS = 60_000, TIMEOUT_MS = 3_000;
interface Cached { at: number; release: BridgeRelease | null; failed: boolean }

/** The latest release, cached in KV for 10 minutes. When GitHub cannot be reached the cached one comes back with `failed`, and the next try waits a minute. Never throws; at most 3 s. */
export async function latestBridgeRelease(now = Date.now()): Promise<{ release: BridgeRelease | null; failed: boolean }> {
  const c = await kv.get<Cached>(CACHE).catch(() => null);
  if (c && typeof c.at === 'number' && now - c.at < (c.failed ? RETRY_MS : FRESH_MS)) return { release: c.release ?? null, failed: !!c.failed };
  let release: BridgeRelease | null = null;
  let failed = false;
  try {
    const res = await fetch(`https://api.github.com/repos/${BRIDGE_REPO}/releases?per_page=20`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    release = pickBridgeRelease(await res.json());
    if (!release) failed = true; // an answer with no bridge release in it: keep what we had
  } catch { failed = true; }
  const kept = failed ? (c?.release ?? null) : release;
  await kv.set(CACHE, { at: now, release: kept, failed } satisfies Cached).catch(() => {});
  return { release: kept, failed };
}
