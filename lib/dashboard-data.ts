import { kv } from './db';
import { getCollection, listAllPacks, listSeasons } from './kv';
import type { Card, Pack, Season } from './types';
import { DEFAULT_LAYOUT, sanitizeLayout, type DashboardLayout, type WidgetType } from './dashboard';
import { uniqueCount } from './collection';
import { rarityStats } from './rarity';
import { getAvatars } from './avatars';
import { getActivity, type ActivityEvent } from './activity';
import { getSeasonLeaderboard, type LeaderboardRow, type SeasonValues } from './leaderboard';
import { listOpenTrades, tradeHistory } from './trades';
import type { Trade } from './trade-core';
import { getLiveStatus, getLatestRecap, type LiveStatus } from './twitch-live';
import type { StreamRecap } from './stream-recap';
import { getLatestDigest } from './weekly-digest-store';
import type { WeeklyDigest } from './weekly-digest';
import { allowedVariants, decodeEntry, emptyCounts, usesFullArt, type VariantCounts } from './variants';
import { getOverlayStatus, type OverlayStatus } from './overlay';
import { getTradeSettings } from './trades';
import { bucketsFor, getSeries, type Range, type Series } from './stats';
import { twitchCredentials } from './twitch-helix';
import { getOverlaySettings } from './overlay-settings';
import { jsonBytes, sizeAttention } from './data-health';
import { countNewFeedback, listFeedback } from './feedback';
import { DELETION_OVERDUE_DAYS } from './feedback-core';
import { autoDisabledChannels } from './discord';

// Server side of the admin dashboard: where the layout and notes are stored, and the numbers the widgets show.
// Only what the widgets in the saved layout need is computed (the leaderboard, activity log, trades and live status cost
// extra reads), so a trimmed-down dashboard is a cheaper one.

const LAYOUT_KEY = 'admin:dashboard'; // the shared layout: what everyone had before layouts were per person, and the emergency password login's
const NOTES_KEY = 'admin:dashboard:notes';

/**
 * Where one person's layout lives. `login` is a staff member's Twitch login; null (the emergency password login) uses the shared key.
 * The "user" segment keeps a login called "notes" or "presets" from landing on those keys.
 */
export function layoutKeyFor(login: string | null): string {
  const clean = (login ?? '').trim().toLowerCase();
  return clean ? `${LAYOUT_KEY}:user:${clean}` : LAYOUT_KEY;
}

/** This person's layout, else the shared one (so nobody loses what they had), else the default. */
export async function getDashboardLayout(login: string | null = null): Promise<DashboardLayout> {
  try {
    const stored = (login ? await kv.get<DashboardLayout>(layoutKeyFor(login)) : null) ?? await kv.get<DashboardLayout>(LAYOUT_KEY);
    return stored ? sanitizeLayout(stored) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export async function saveDashboardLayout(layout: DashboardLayout, login: string | null = null): Promise<void> {
  await kv.set(layoutKeyFor(login), sanitizeLayout(layout));
}

export async function resetDashboardLayout(login: string | null = null): Promise<void> {
  await kv.del(layoutKeyFor(login));
}

export async function getDashboardNotes(): Promise<string> {
  try { return (await kv.get<string>(NOTES_KEY)) ?? ''; } catch { return ''; }
}

export async function saveDashboardNotes(text: string): Promise<void> {
  await kv.set(NOTES_KEY, text.slice(0, 4000));
}

export interface AttentionItem {
  id: string;
  level: 'warn' | 'info';
  text: string;
  href?: string;
  cta?: string;
}

/** Things worth a look, most urgent first: each is a plain check against data we already keep. */
async function computeAttention(season: Season, packs: { pack: Pack; cards: Card[] }[], live: LiveStatus | null, overlay: OverlayStatus | null, collectionBytes: number): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const size = sizeAttention(season.name, collectionBytes);
  if (size) items.push({ id: 'data-size', level: 'warn', text: size.text, href: '/admin/settings?tab=environment', cta: 'Data health' });
  const [allPacks, seasons, tradeSettings, open] = await Promise.all([
    listAllPacks().catch(() => [] as Pack[]), listSeasons().catch(() => [] as Season[]),
    getTradeSettings().catch(() => null), listOpenTrades().catch(() => [] as Trade[]),
  ]);
  if (live?.live && overlay && overlay.connected === 0) items.push({ id: 'overlay-live', level: 'warn', text: 'The channel is live but no overlay is connected, so gifts and pulls will not play.', href: '/admin/settings?tab=overlay', cta: 'Overlay settings' });
  if (overlay && overlay.queued > 20) items.push({ id: 'queue', level: 'warn', text: `${overlay.queued} events are waiting in the overlay queue.`, href: '/admin#quick-actions', cta: 'Clear queue' });
  if (packs.length === 0) items.push({ id: 'no-packs', level: 'warn', text: 'This season has no active pack with cards, so nothing can be drawn.', href: `/admin/seasons/${season.id}`, cta: 'Season settings' });
  const inSeason = new Set(seasons.flatMap(s => s.packIds));
  const orphans = allPacks.filter(p => p.status === 'published' && !inSeason.has(p.id));
  if (orphans.length > 0) items.push({ id: 'orphans', level: 'warn', text: `${orphans.length} published pack${orphans.length === 1 ? ' is' : 's are'} not in any season, so can never be drawn: ${orphans.slice(0, 3).map(p => p.name).join(', ')}${orphans.length > 3 ? '…' : ''}`, href: '/admin/packs', cta: 'Packs' });
  const noFullArt = packs.flatMap(({ pack, cards }) => (pack.upgradesEnabled ? cards.filter(c => !c.fullArtImageUrl && allowedVariants(pack, c).some(usesFullArt)) : []));
  if (noFullArt.length > 0) items.push({ id: 'full-art', level: 'warn', text: `${noFullArt.length} card${noFullArt.length === 1 ? '' : 's'} can be pulled as Full Art / Full Art Holo / Golden but ${noFullArt.length === 1 ? 'has' : 'have'} no full-art image (they reuse the normal art).`, href: '/admin/packs', cta: 'Fix in packs' });
  if (tradeSettings && !tradeSettings.enabled) items.push({ id: 'trading-paused', level: 'info', text: 'Trading is paused: nothing new can be offered or accepted.', href: '/admin/trades', cta: 'Trades' });
  const soon = open.filter(t => t.expiresAt - Date.now() < 6 * 3_600_000).length;
  if (soon > 0) items.push({ id: 'expiring', level: 'info', text: `${soon} trade offer${soon === 1 ? '' : 's'} expire${soon === 1 ? 's' : ''} within 6 hours (the cards return to their owners).`, href: '/admin/trades', cta: 'Trades' });
  for (const c of await autoDisabledChannels()) items.push({ id: `discord-off-${c.id}`, level: 'warn', text: `The Discord channel "${c.name}": ${c.reason}.`, href: '/admin/settings?tab=webhooks', cta: 'Webhooks' });
  const drafts = allPacks.filter(p => p.status === 'draft').length + seasons.filter(s => s.status === 'draft').length;
  if (drafts > 0) items.push({ id: 'drafts', level: 'info', text: `${drafts} draft pack${drafts === 1 ? '' : 's'} or season${drafts === 1 ? '' : 's'} waiting to be published.`, href: '/admin/packs', cta: 'Review drafts' });
  const deletions = (await listFeedback({ kind: 'deletion', status: 'new' }).catch(() => [])).sort((a, b) => a.at - b.at);
  if (deletions.length > 0) {
    const overdue = Date.now() - deletions[0].at > DELETION_OVERDUE_DAYS * 86_400_000;
    items.push({ id: 'deletions', level: overdue ? 'warn' : 'info', text: `${deletions.length} account deletion request${deletions.length === 1 ? '' : 's'} waiting${overdue ? ', the oldest for more than a month (people expect it done within about a month)' : ''}.`, href: '/admin/feedback?kind=deletion', cta: 'Deletion requests' });
  }
  const reports = await listFeedback({ kind: 'report', status: 'new' }).catch(() => []);
  if (reports.length > 0) items.push({ id: 'reports', level: 'warn', text: `${reports.length} user report${reports.length === 1 ? '' : 's'} waiting for a look.`, href: '/admin/feedback?kind=report', cta: 'User reports' });
  const waiting = Math.max(0, (await countNewFeedback().catch(() => 0)) - reports.length);
  if (waiting > 0) items.push({ id: 'feedback', level: 'info', text: `${waiting} new suggestion${waiting === 1 ? '' : 's'} or problem report${waiting === 1 ? '' : 's'} from viewers waiting for a look.`, href: '/admin/feedback', cta: 'Feedback' });
  if (!twitchCredentials()) items.push({ id: 'twitch', level: 'info', text: 'Twitch credentials are not set, so avatars and the live indicator are switched off.', href: '/admin/settings?tab=viewers', cta: 'Viewer settings' });
  return items;
}

export interface DashboardData {
  season: Season;
  packs: { pack: Pack; cards: Card[] }[];
  allCards: Card[];
  users: [string, number[]][];
  totalUsers: number;
  totalOwned: number;
  totalUnique: number;
  avgCompletion: number;
  /** Highest share of the card pool any one player owns, in percent. */
  bestPct: number;
  /** The top eight by points (the leaderboard's order), with how much of the pool each owns. */
  topCollectors: { username: string; owned: number; pct: number; score: number }[];
  cardStats: (Card & { ownedBy: number })[];
  avatars: Record<string, string | undefined>;
  rarityDist: ReturnType<typeof rarityStats>;
  variantCounts: VariantCounts;
  activity: ActivityEvent[];
  trades: { open: Trade[]; recent: Trade[]; escrowedCopies: number; completed24h: number } | null;
  board: { rows: LeaderboardRow[]; values: SeasonValues } | null;
  live: LiveStatus | null;
  recap: StreamRecap | null;
  digest: WeeklyDigest | null;
  notes: string;
  /** The dashboard's chosen time range, with this period's and the previous period's counters. */
  range: Range['id'];
  series: Series | null;
  prevSeries: Series | null;
  attention: AttentionItem[];
  overlay: OverlayStatus | null;
  /** Events an admin caused (grants, removals, resets, gifts, cancellations), newest first. */
  adminActions: ActivityEvent[];
  /** Distinct viewers per day for the last 7 days (oldest first), whatever the chosen range. */
  dailyViewers: number[];
  overlaySettings: { livePacksOnly: boolean; liveCollectionsOnly: boolean };
}

export async function loadDashboardData(season: Season, packs: { pack: Pack; cards: Card[] }[], needs: Set<WidgetType>, range: Range['id'] = '7d'): Promise<DashboardData> {
  const allCards = packs.flatMap(p => p.cards);
  const collection = await getCollection(season.collectionName);
  const users = Object.entries(collection);
  const totalUsers = users.length;
  const totalOwned = users.reduce((s, [, c]) => s + c.length, 0);
  const totalUnique = users.reduce((s, [, c]) => s + uniqueCount(c), 0);
  const avgCompletion = totalUsers > 0 && allCards.length > 0 ? Math.round((totalUnique / totalUsers / allCards.length) * 100) : 0;

  const freq: Record<number, number> = {};
  const variantCounts = emptyCounts();
  for (const [, owned] of users) {
    const seen = new Set<number>();
    for (const entry of owned) {
      const { cardNumber, variant } = decodeEntry(entry);
      seen.add(cardNumber);
      variantCounts[variant]++;
    }
    seen.forEach(n => { freq[n] = (freq[n] ?? 0) + 1; });
  }

  const bestPct = allCards.length > 0 ? Math.round((Math.max(0, ...users.map(([, c]) => uniqueCount(c))) / allCards.length) * 100) : 0;
  // Top collectors rank by points, the same order as the site leaderboard (hidden players left out), so one board feeds this and the Leaderboard widget.
  const boardP = needs.has('leaderboard') || needs.has('valuable') || needs.has('top-collectors') ? getSeasonLeaderboard(season).catch(() => null) : Promise.resolve(null);
  const cardStats = allCards.map(c => ({ ...c, ownedBy: freq[c.number] ?? 0 })).sort((a, b) => b.stars - a.stars || b.ownedBy - a.ownedBy);

  const wantsActivity = needs.has('activity') || needs.has('pulse') || needs.has('changes');
  const wantsSeries = needs.has('pulls-chart') || needs.has('pulse') || needs.has('viewers') || needs.has('progress') || needs.has('economy');
  const wantsLive = needs.has('live') || needs.has('attention') || needs.has('recap');
  const wantsOverlay = needs.has('attention') || needs.has('overlay-controls');
  const { starts, step } = bucketsFor(range, season.createdAt);
  const span = step === 'hour' ? 3_600_000 : 86_400_000;
  const [avatars, activity, openTrades, history, board, live, notes, recap, digest, series, prevSeries, overlay, dailySeries, overlaySettings] = await Promise.all([
    needs.has('top-collectors') ? boardP.then(b => getAvatars((b?.rows ?? []).slice(0, 8).map(r => r.username))) : Promise.resolve({}),
    wantsActivity ? getActivity({ limit: 500 }).then(r => r.events).catch(() => []) : Promise.resolve([] as ActivityEvent[]),
    needs.has('trades') ? listOpenTrades().catch(() => [] as Trade[]) : Promise.resolve(null),
    needs.has('trades') ? tradeHistory().catch(() => [] as Trade[]) : Promise.resolve(null),
    boardP,
    wantsLive ? getLiveStatus().catch(() => null) : Promise.resolve(null),
    needs.has('notes') ? getDashboardNotes() : Promise.resolve(''),
    needs.has('recap') ? getLatestRecap() : Promise.resolve(null),
    needs.has('digest') ? getLatestDigest() : Promise.resolve(null),
    wantsSeries ? getSeries(season.collectionName, starts, step) : Promise.resolve(null),
    wantsSeries ? getSeries(season.collectionName, starts.map(s => s - starts.length * span), step) : Promise.resolve(null),
    wantsOverlay ? getOverlayStatus().catch(() => null) : Promise.resolve(null),
    needs.has('viewers') ? getSeries(season.collectionName, bucketsFor('7d', season.createdAt).starts, 'day') : Promise.resolve(null),
    needs.has('overlay-controls') ? getOverlaySettings().catch(() => null) : Promise.resolve(null),
  ]);
  const topCollectors = (board?.rows ?? []).slice(0, 8).map(r => ({
    username: r.username,
    owned: r.uniqueCards,
    pct: allCards.length > 0 ? Math.round((r.uniqueCards / allCards.length) * 100) : 0,
    score: r.score,
  }));
  const attention = needs.has('attention') ? await computeAttention(season, packs, live, overlay, needs.has('attention') ? jsonBytes(collection) : 0) : [];
  const adminActions = activity.filter(e => (e.type === 'grant' && e.source === 'admin') || e.type === 'remove' || e.type === 'reset' || e.type === 'delete' || (e.type === 'trigger' && e.source === 'admin') || (e.type === 'trade' && e.by === 'admin')).slice(0, 12);

  const trades = openTrades && history
    ? {
        open: openTrades,
        recent: history.slice(0, 6),
        escrowedCopies: openTrades.filter(t => t.escrowed).reduce((n, t) => n + t.give.reduce((m, i) => m + i.count, 0), 0),
        completed24h: history.filter(t => t.status === 'accepted' && (t.resolvedAt ?? 0) > Date.now() - 86_400_000).length,
      }
    : null;

  return {
    season, packs, allCards, users, totalUsers, totalOwned, totalUnique, avgCompletion, bestPct, topCollectors, cardStats,
    avatars: avatars as Record<string, string | undefined>,
    rarityDist: rarityStats(allCards),
    variantCounts, activity, trades, board: board ? { rows: board.rows, values: board.values } : null, live, recap, digest, notes,
    range, series, prevSeries, attention, overlay, adminActions,
    dailyViewers: dailySeries?.viewers ?? [],
    overlaySettings: { livePacksOnly: !!overlaySettings?.livePacksOnly, liveCollectionsOnly: !!overlaySettings?.liveCollectionsOnly },
  };
}

// ── Presets: named layouts the admin can switch between ──
const PRESETS_KEY = 'admin:dashboard:presets';
export interface DashboardPreset { name: string; layout: DashboardLayout; /** Who saved it (a staff login), when known. */ by?: string }
const PRESET_CAP = 12;

export async function getDashboardPresets(): Promise<DashboardPreset[]> {
  try {
    const stored = await kv.get<DashboardPreset[]>(PRESETS_KEY);
    return (stored ?? []).filter(p => p && typeof p.name === 'string').map(p => ({ name: p.name, layout: sanitizeLayout(p.layout), ...(typeof p.by === 'string' ? { by: p.by } : {}) }));
  } catch {
    return [];
  }
}

export async function saveDashboardPreset(name: string, layout: DashboardLayout, by?: string): Promise<void> {
  const rest = (await getDashboardPresets()).filter(p => p.name !== name);
  await kv.set(PRESETS_KEY, [{ name, layout, ...(by ? { by } : {}) }, ...rest].slice(0, PRESET_CAP));
}

export async function deleteDashboardPreset(name: string): Promise<void> {
  await kv.set(PRESETS_KEY, (await getDashboardPresets()).filter(p => p.name !== name));
}
