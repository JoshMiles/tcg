// The live pull feed and the end-of-stream summary (ROADMAP 55.11), the pure parts. Plain TypeScript, no Electron.

export interface FeedItem { viewer: string; card: string; rarity: string; stars: number; variant: string; serial: number; image: string }
export interface FeedSettings { on: boolean; minStars: number; volume: number; muted: boolean; onTop: boolean }
export const defaultFeed = (): FeedSettings => ({ on: false, minStars: 4, volume: 0.5, muted: false, onTop: false });

/** Blob hosts of the site's uploads (Vercel Blob public stores). */
const BLOB = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;

/** A card image address that may be loaded: https from the paired site's own origin or Vercel Blob (a site-relative path counts as the site's own). Anything else comes back empty. */
export function trustedImage(raw: unknown, site: string): string {
  if (typeof raw !== 'string' || !raw || raw.length > 600) return '';
  try {
    const base = new URL(site);
    const u = new URL(raw, base);
    const own = u.origin === base.origin;
    if (u.username || u.password || (!own && (u.protocol !== 'https:' || !BLOB.test(u.hostname)))) return '';
    return u.protocol === 'https:' || own ? u.href : '';
  } catch { return ''; }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** One pull from the site, cleaned for the window; null when it is not a pull. The image is dropped unless trusted. */
export function cleanFeed(raw: unknown, site: string): FeedItem | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!o || typeof o.viewer !== 'string' || typeof o.card !== 'string' || !o.viewer || !o.card) return null;
  const stars = Number.isInteger(o.stars) ? Math.min(5, Math.max(1, o.stars as number)) : 1;
  const serial = Number.isInteger(o.serial) && (o.serial as number) > 0 ? (o.serial as number) : 0;
  return { viewer: text(o.viewer, 40), card: text(o.card, 80), rarity: text(o.rarity, 30), stars, variant: text(o.variant, 30), serial, image: trustedImage(o.image, site) };
}

/** The sound plays for a pull at or above the chosen rarity, unless muted or silent. */
export const shouldPlay = (stars: number, f: Pick<FeedSettings, 'minStars' | 'volume' | 'muted'>): boolean => !f.muted && f.volume > 0 && stars >= f.minStars;

export const cleanFeedSettings = (raw: Partial<FeedSettings> | undefined, was: FeedSettings): FeedSettings => ({
  on: typeof raw?.on === 'boolean' ? raw.on : was.on,
  minStars: Number.isInteger(raw?.minStars) ? Math.min(5, Math.max(1, raw!.minStars as number)) : was.minStars,
  volume: typeof raw?.volume === 'number' && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : was.volume,
  muted: typeof raw?.muted === 'boolean' ? raw.muted : was.muted,
  onTop: typeof raw?.onTop === 'boolean' ? raw.onTop : was.onTop,
});

export interface SummaryPull { username: string; cardName: string; rarity: string; variant: string; serial: number }
export interface Summary { packs: number; pullers: number; partial: boolean; topPullers: { username: string; packs: number }[]; bigPulls: SummaryPull[]; taken: number; refunded: number }

const n = (v: unknown, max = 1e9): number => (Number.isFinite(v) && (v as number) > 0 ? Math.min(max, Math.trunc(v as number)) : 0);

/** The summary job's data, cleaned; null when it is not one. */
export function cleanSummary(raw: unknown): Summary | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, 5) : []);
  return {
    packs: n(o.packs), pullers: n(o.pullers), partial: o.partial === true, taken: n(o.taken), refunded: n(o.refunded),
    topPullers: list(o.topPullers).map(p => ({ username: text(p.username, 40), packs: n(p.packs) })).filter(p => p.username),
    bigPulls: list(o.bigPulls).map(p => ({ username: text(p.username, 40), cardName: text(p.cardName, 80), rarity: text(p.rarity, 30), variant: text(p.variant, 30), serial: n(p.serial) })).filter(p => p.username && p.cardName),
  };
}

/** Plain Markdown for Discord. */
export function summaryMarkdown(s: Summary, channel: string): string {
  const lines = [`**${channel || 'Stream'} recap**`, `Packs opened: ${s.packs}${s.partial ? '+' : ''} by ${s.pullers} viewer${s.pullers === 1 ? '' : 's'}`];
  if (s.bigPulls.length) lines.push('', '**Big pulls**', ...s.bigPulls.map(p => `- ${p.cardName} (${[p.rarity, p.variant !== 'Regular' ? p.variant : ''].filter(Boolean).join(', ')}${p.serial ? `, #${p.serial}` : ''}) pulled by ${p.username}`));
  if (s.topPullers.length) lines.push('', '**Top pullers**', ...s.topPullers.map((p, i) => `${i + 1}. ${p.username}: ${p.packs} pack${p.packs === 1 ? '' : 's'}`));
  lines.push('', `Brie Bucks: ${s.taken.toLocaleString('en-GB')} taken, ${s.refunded.toLocaleString('en-GB')} refunded`);
  return lines.join('\n');
}
