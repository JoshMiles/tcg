// The What's new tab (ROADMAP 57.11): release notes from the public GitHub releases, cached on disk. Plain TypeScript, no Electron.
// The notes are untrusted text from the network: parseNotes keeps only headings, bullets and plain paragraphs, and the window builds them with textContent.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const RELEASES_API = 'https://api.github.com/repos/JoshMiles/tcg/releases?per_page=50';
export const RELEASES_URL = 'https://github.com/JoshMiles/tcg/releases';
export const CACHE_MS = 6 * 60 * 60 * 1000;
export const MAX_NOTES = 20;

export type Release = { version: string; body: string };
export type Block = { kind: 'heading' | 'bullet' | 'text'; text: string };
export type Note = { version: string; blocks: Block[] };

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const parts = (v: string): number[] => (VERSION.exec(v) ?? []).slice(1).map(Number);

/** Semver order for x.y.z: negative when a is older than b. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** From the raw GitHub list: the non-draft `bridge-v<x.y.z>` releases, as version and notes text. Anything else is dropped. */
export function bridgeReleases(raw: unknown): Release[] {
  if (!Array.isArray(raw)) return [];
  const out: Release[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object' || (r as { draft?: unknown }).draft === true) continue;
    const { tag_name, body } = r as { tag_name?: unknown; body?: unknown };
    const m = typeof tag_name === 'string' ? /^bridge-v(\d+\.\d+\.\d+)$/.exec(tag_name) : null;
    if (m) out.push({ version: m[1], body: typeof body === 'string' ? body : '' });
  }
  return out;
}

/** The releases after `lastSeen` (exclusive) up to `current` (inclusive), newest first, at most MAX_NOTES. */
export function releasesBetween(all: Release[], lastSeen: string, current: string): Release[] {
  return all
    .filter(r => compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, MAX_NOTES);
}

/** A tiny markdown subset: `#` headings, `-`/`*`/`+` bullets, everything else a paragraph. Links, bold and code marks are reduced to their text; HTML stays as plain text. */
export function parseNotes(body: string): Block[] {
  const plain = (s: string): string => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').trim();
  const blocks: Block[] = [];
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const b = /^\s*[-*+]\s+(.*)$/.exec(line);
    const text = plain(h ? h[1] : b ? b[1] : line);
    if (text) blocks.push({ kind: h ? 'heading' : b ? 'bullet' : 'text', text });
  }
  return blocks;
}

type Cache = { at: number; releases: Release[] };

const validCache = (c: unknown): c is Cache => !!c && typeof c === 'object' && typeof (c as Cache).at === 'number' && Array.isArray((c as Cache).releases);

/** The bridge releases: the cache file when under 6 hours old, else a fresh fetch (saved to the cache). A failed fetch falls back to an older cache, or throws. */
export async function loadReleases(dir: string, now: number, fetchList: () => Promise<unknown>): Promise<Release[]> {
  const file = join(dir, 'releases-cache.json');
  let cache: Cache | null = null;
  try { const c: unknown = JSON.parse(await readFile(file, 'utf8')); if (validCache(c)) cache = { at: c.at, releases: bridgeReleases(c.releases.map(r => ({ tag_name: `bridge-v${r.version}`, body: r.body }))) }; } catch { /* no cache yet */ }
  if (cache && now - cache.at >= 0 && now - cache.at < CACHE_MS) return cache.releases;
  try {
    const releases = bridgeReleases(await fetchList());
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify({ at: now, releases }), 'utf8');
    return releases;
  } catch (e) {
    if (cache) return cache.releases;
    throw e;
  }
}
