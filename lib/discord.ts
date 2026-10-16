import { kv, inSandbox } from './db';
import { after } from 'next/server';
import type { ActivityEvent } from './activity';
import { getActiveSeasonWithPacks } from './kv';
import { cardThumbUrl } from './card-art';
import { getRarity } from './rarity';
import { getAvatars, sizeTwitchAvatar } from './avatars';
import { VARIANT_LABELS } from './variants';
import type { StreamRecap } from './stream-recap';
import type { WeeklyDigest } from './weekly-digest';
import { discordText, type FeedbackItem } from './feedback-core';
import { SITE_URL } from './site';
import { copyHrefFor } from './copy-link';
import { DEFAULT_CATEGORIES, DEFAULT_DISCORD, MAX_DISCORD_CHANNELS, type DiscordCategory, type DiscordChannel, type DiscordLogEntry, type DiscordSettings, DISCORD_LOG_CAP } from './discord-config';

export { DISCORD_CATEGORIES, DEFAULT_DISCORD } from './discord-config';
export type { DiscordCategory, DiscordChannel, DiscordSettings } from './discord-config';

// Posts the live activity feed to a Discord channel through an incoming webhook.
// Settings live in KV (`discord:settings`); events arrive from recordActivity() in lib/activity.ts.

const KEY = 'discord:settings';

const clampStars = (n: unknown) => Math.min(5, Math.max(1, Number(n) || 1));

/** Channels saved before upgrades and trades had boxes of their own keep posting them wherever `cards` was ticked. */
function normalizeCategories(raw: Partial<Record<DiscordCategory, boolean>> | undefined): Record<DiscordCategory, boolean> {
  const cats = { ...DEFAULT_CATEGORIES, ...(raw ?? {}) };
  if (raw && raw.upgrades === undefined) cats.upgrades = !!cats.cards;
  if (raw && raw.trades === undefined) cats.trades = !!cats.cards;
  return cats;
}

function normalizeChannel(c: Partial<DiscordChannel> | null | undefined, fallbackId: string): DiscordChannel {
  const id = typeof c?.id === 'string' ? c.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : '';
  return {
    id: id || fallbackId,
    name: (typeof c?.name === 'string' ? c.name.trim() : '').slice(0, 40) || 'Channel',
    url: typeof c?.url === 'string' ? c.url.trim() : '',
    enabled: !!c?.enabled,
    categories: normalizeCategories(c?.categories),
    minStars: clampStars(c?.minStars),
    newOnly: !!c?.newOnly,
    ...(!c?.enabled && typeof c?.offReason === 'string' && c.offReason ? { offReason: c.offReason.slice(0, 300) } : {}),
  };
}

/**
 * Reads whatever is stored. The first version kept one webhook at the top level ({ url, enabled, categories, minStars, newOnly });
 * that becomes one channel called "Activity" with the same settings, so nothing changes until an admin edits it.
 */
export function normalize(s: (Partial<DiscordSettings> & Partial<DiscordChannel>) | null | undefined): DiscordSettings {
  if (!s) return { ...DEFAULT_DISCORD, channels: [] };
  if (!Array.isArray(s.channels)) {
    const url = typeof s.url === 'string' ? s.url.trim() : '';
    if (!url) return { enabled: !!s.enabled, channels: [] };
    return { enabled: !!s.enabled, channels: [normalizeChannel({ ...s, id: 'activity', name: 'Activity', enabled: true }, 'activity')] };
  }
  const seen = new Set<string>();
  const channels = s.channels.slice(0, MAX_DISCORD_CHANNELS).map((c, i) => {
    let ch = normalizeChannel(c, `channel${i + 1}`);
    while (seen.has(ch.id)) ch = { ...ch, id: ch.id + 'x' };
    seen.add(ch.id);
    return ch;
  });
  return { enabled: !!s.enabled, channels };
}

export async function getDiscordSettings(): Promise<DiscordSettings> {
  return normalize(await kv.get<Partial<DiscordSettings>>(KEY));
}

export async function saveDiscordSettings(s: DiscordSettings): Promise<void> {
  await kv.set(KEY, normalize(s));
}

/**
 * Only real Discord webhook URLs are accepted. The server POSTs to whatever is stored here, so an
 * arbitrary URL would let a typo (or a compromised session) aim requests at any host.
 * Outside production a plain http://localhost URL is also allowed so the feature can be tested
 * against a local stand-in.
 */
export function isValidDiscordWebhookUrl(url: string): boolean {
  if (/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url)) return true;
  return process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url);
}

export function categoryOf(e: ActivityEvent): DiscordCategory {
  switch (e.type) {
    case 'pull': return 'pulls';
    case 'grant':
    case 'remove': return 'cards';
    case 'upgrade': return 'upgrades';
    case 'trade': return 'trades';
    case 'trigger':
    case 'collection_shown': return 'stream';
    default: return 'resets'; // reset, delete
  }
}

/** Does this channel want this event? (Whether the channel is switched on is checked by the caller.) */
export function shouldSend(e: ActivityEvent, c: Pick<DiscordChannel, 'categories' | 'minStars' | 'newOnly'>): boolean {
  // A staff action also goes to channels with the admin log on (which is where the staff member's name shows).
  if (!c.categories[categoryOf(e)] && !(e.staff && c.categories.admin)) return false;
  // Offers, counters, completed trades and admin cancels are worth a post; a viewer declining, withdrawing or letting one expire is noise.
  if (e.type === 'trade' && !(e.action === 'offered' || e.action === 'countered' || e.action === 'accepted' || e.by === 'admin')) return false;
  if (e.type === 'pull') {
    if (e.stars < c.minStars) return false;
    if (c.newOnly && !e.isNew) return false;
  }
  return true;
}

/** Checks the settings form's submission. Returns the cleaned settings, or the first problem in words. */
export function cleanDiscordInput(raw: unknown): { ok: true; settings: DiscordSettings } | { ok: false; message: string } {
  const r = raw as Partial<DiscordSettings> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.channels)) return { ok: false, message: 'The settings could not be read. Reload the page and try again.' };
  if (r.channels.length > MAX_DISCORD_CHANNELS) return { ok: false, message: `At most ${MAX_DISCORD_CHANNELS} channels.` };
  const settings = normalize({ enabled: !!r.enabled, channels: r.channels });
  for (const c of settings.channels) {
    if (c.url && !isValidDiscordWebhookUrl(c.url)) return { ok: false, message: `${c.name}: that doesn’t look like a Discord webhook URL. It should start with https://discord.com/api/webhooks/…` };
    if (c.enabled && !c.url) return { ok: false, message: `${c.name}: add a webhook URL before turning it on.` };
  }
  return { ok: true, settings };
}

// ── Message building ──────────────────────────────────────

interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: { name: string; url?: string; icon_url?: string };
  thumbnail?: { url: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordPayload {
  username: string;
  allowed_mentions: { parse: never[] };
  embeds: Embed[];
}

const GOLD = 0xffcb05;
const GRAY = 0x6b7280;
const RED = 0xef4444;
const GREEN = 0x22c55e;
const BLUE = 0x6b7cff;

// Names come from an unauthenticated endpoint, so neutralise Markdown (and, via allowed_mentions, pings).
const esc = (s: string) => s.replace(/([\\*_~`|>[\]()])/g, '\\$1').slice(0, 100);
/** Markdown-neutralises a name for use in a Discord message. */
export const escapeMd = esc;
const hexToInt = (hex: string) => parseInt(hex.replace('#', ''), 16);
const absolute = (url: string) => (url.startsWith('/') ? SITE_URL + url : url);

function payload(embed: Embed): DiscordPayload {
  return { username: 'TCG Activity', allowed_mentions: { parse: [] }, embeds: [embed] };
}

/** Builds the Discord message for an activity event (looks up card art and the viewer's avatar). */
async function buildBase(e: ActivityEvent, opts: { footer?: string } = {}): Promise<DiscordPayload> {
  const active = await getActiveSeasonWithPacks().catch(() => null);
  const cards = (active?.packs ?? []).flatMap(p => p.cards.map(c => ({ ...c, packName: p.pack.name })));
  const totalCards = cards.length;
  const cardFor = (n: number, pack?: string) => cards.find(c => c.number === n && (!pack || c.packName === pack)) ?? cards.find(c => c.number === n);

  const avatarUrl = e.username ? (await getAvatars([e.username]))[e.username] : undefined;
  const author = e.username
    ? {
        name: e.username,
        url: `${SITE_URL}/u/${encodeURIComponent(e.username)}`,
        ...(avatarUrl ? { icon_url: sizeTwitchAvatar(avatarUrl, 70) } : {}),
      }
    : undefined;

  const base: Embed = {
    author,
    timestamp: new Date(e.at).toISOString(),
    footer: { text: opts.footer ?? active?.season.name ?? 'TCG' },
  };
  const printUrl = (): Pick<Embed, 'url'> => {
    const href = 'uid' in e || 'serial' in e ? copyHrefFor(e, active?.season.id ?? '') : null;
    return href ? { url: SITE_URL + href } : {};
  };
  const thumb = (imageUrl?: string): Pick<Embed, 'thumbnail'> =>
    imageUrl ? { thumbnail: { url: absolute(cardThumbUrl(imageUrl)) } } : {};

  switch (e.type) {
    case 'pull': {
      const card = cardFor(e.cardNumber, e.packName);
      const rarity = getRarity(e.stars);
      return payload({
        ...base,
        ...thumb(card?.imageUrl),
        ...printUrl(),
        color: rarity ? hexToInt(rarity.hex) : GOLD,
        title: `${'★'.repeat(e.stars)} ${esc(e.cardName || card?.name || `#${e.cardNumber}`)}`,
        description: `${e.serial === 1 ? '🥇 **FIRST EVER!** ' : ''}**${esc(e.username)}** pulled ${/^[aeiou]/i.test(rarity?.label ?? '') ? 'an' : 'a'} **${rarity?.label ?? 'card'}** card${e.variant && e.variant !== 'regular' ? `, ✨ **${VARIANT_LABELS[e.variant]}**` : ''}${e.isNew ? ', **NEW!**' : e.copies > 1 ? `, ×${e.copies}` : ''}`,
        fields: [
          { name: 'Pack', value: esc(e.packName) || '-', inline: true },
          { name: 'Collected', value: totalCards ? `${e.uniqueOwned}/${totalCards}` : String(e.uniqueOwned), inline: true },
          ...(e.serial ? [{ name: 'Edition', value: `**#${e.serial}**${e.serial === 1 ? ' (the first ever)' : ''}${e.bonus ? ` · ×${e.bonus} points` : ''}`, inline: true }] : []),
        ],
      });
    }
    case 'grant': {
      const card = cardFor(e.cardNumber);
      return payload({ ...base, ...thumb(card?.imageUrl), color: GREEN, title: '🎁 Card granted',
        description: `**${esc(card?.name ?? `Card #${e.cardNumber}`)}** → **${esc(e.username)}**\n${e.source === 'webhook' ? 'via webhook' : 'by an admin'}` });
    }
    case 'remove': {
      const card = cardFor(e.cardNumber);
      return payload({ ...base, ...thumb(card?.imageUrl), color: RED, title: '🗑️ Card removed',
        description: `**${esc(card?.name ?? `Card #${e.cardNumber}`)}** removed from **${esc(e.username)}**` });
    }
    case 'upgrade': {
      const card = cardFor(e.cardNumber);
      return payload({ ...base, ...thumb(card?.imageUrl), ...printUrl(), color: GOLD, title: '✨ Card upgraded',
        description: `**${esc(e.username)}** upgraded **${esc(e.cardName || card?.name || `#${e.cardNumber}`)}** to **${VARIANT_LABELS[e.to]}** (${e.cost}× ${VARIANT_LABELS[e.from]})`,
        fields: [
          { name: 'From', value: VARIANT_LABELS[e.from], inline: true },
          { name: 'To', value: VARIANT_LABELS[e.to], inline: true },
          { name: 'Cost', value: `${e.cost}×`, inline: true },
          ...(e.uid ? [{ name: 'New print', value: `**Print #${e.uid}**`, inline: true }] : []),
        ] });
    }
    case 'trade': {
      const card = e.cardNumber ? cardFor(e.cardNumber) : undefined;
      const adminCancel = e.action === 'cancelled' && e.by === 'admin';
      const who = esc(e.username);
      const other = e.partner ? esc(e.partner) : null;
      const head = {
        offered: { color: BLUE, title: e.kind === 'listing' ? '📋 Trade listed on the board' : '🔁 Trade offered', text: e.kind === 'listing' ? `**${who}** posted a listing on the open board` : `**${who}** offered **${other}** a trade` },
        countered: { color: BLUE, title: '↩️ Counter-offer', text: `**${who}** countered **${other}**'s offer` },
        accepted: { color: GREEN, title: '🤝 Trade completed', text: `**${who}** and **${other}** swapped cards` },
        declined: { color: RED, title: '🚫 Trade declined', text: `**${other}** declined **${who}**'s offer` },
        cancelled: { color: RED, title: adminCancel ? '🛡️ Trade cancelled by an admin' : '✖️ Trade cancelled', text: `**${who}**'s offer was cancelled` },
        expired: { color: RED, title: '⌛ Trade expired', text: `**${who}**'s offer ran out of time` },
      }[e.action];
      const list = (lines: string[]) => (lines.join('\n') || '-').slice(0, 1000);
      const fields: { name: string; value: string; inline?: boolean }[] = [
        { name: `${who} gives · ≈${e.givePts.toLocaleString()} pts`, value: list(e.give.map(esc)), inline: true },
        { name: `${e.action === 'accepted' && other ? other : e.kind === 'listing' ? 'In return' : other ?? 'In return'} gives · ≈${e.getPts.toLocaleString()} pts`, value: list(e.get.map(esc)), inline: true },
      ];
      if (e.note) fields.push({ name: 'Note', value: esc(e.note).slice(0, 200) });
      return payload({ ...base, ...thumb(card?.imageUrl), color: head.color, title: head.title, description: head.text, fields });
    }
    case 'reset':
      return payload({ ...base, color: RED, title: '🔄 Collection reset',
        description: e.scope === 'everyone' ? '**All collections** were reset' : `**${esc(e.username)}**'s collection was reset${e.scope === 'all' ? ' across all seasons' : ''}` });
    case 'delete':
      return payload({ ...base, color: RED, title: '❌ User deleted', description: `**${esc(e.username)}** was deleted` });
    case 'trigger': {
      const gifted = e.source === 'admin' && e.kind === 'pull';
      return payload({ ...base, color: BLUE,
        title: gifted ? '🎁 Packs gifted' : e.kind === 'pull' ? '⚡ Pack draw requested' : e.kind === 'card' ? '🃏 Card shown off' : '📖 Collection view requested',
        description: gifted
          ? `${(e.count ?? 1) > 1 ? `${e.count} packs` : 'A pack'} gifted to **${esc(e.username)}**`
          : `**${esc(e.username)}**, ${e.source === 'admin' ? 'by an admin' : 'via webhook'}` });
    }
    case 'collection_shown':
      return payload({ ...base, color: BLUE, title: '📺 Collection shown', description: `**${esc(e.username)}**'s collection was shown on stream` });
  }
}

/** The message for an activity event. With `showStaff` an event a staff member caused also says who (only the admin log channels get that). */
export async function buildMessage(e: ActivityEvent, opts: { footer?: string; showStaff?: boolean } = {}): Promise<DiscordPayload> {
  const msg = await buildBase(e, opts);
  if (opts.showStaff && e.staff) {
    const embed = msg.embeds[0];
    embed.fields = [...(embed.fields ?? []), { name: 'By', value: `@${esc(e.staff)}`, inline: true }];
  }
  return msg;
}

/** The end-of-stream recap embed. `footer` marks a test send. */
export function buildRecapMessage(r: StreamRecap, opts: { footer?: string } = {}): DiscordPayload {
  const rarity = r.rarest ? getRarity(r.rarest.stars) : null;
  const mins = Math.max(1, Math.round((r.to - r.from) / 60000));
  const length = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  const printLine = (p: NonNullable<StreamRecap['rarest']>) => {
    const name = `${'★'.repeat(p.stars)} ${esc(p.cardName)}${p.variant && p.variant !== 'regular' ? ` (${VARIANT_LABELS[p.variant]})` : ''}`;
    return `${p.href ? `[${name}](${SITE_URL}${p.href})` : name}${p.serial ? `, Print #${p.serial}` : ''}
pulled by **${esc(p.username)}**`;
  };
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Packs opened', value: String(r.packs), inline: true },
    { name: 'Different cards', value: String(r.distinctCards), inline: true },
    { name: 'Collectors', value: String(r.pullers), inline: true },
  ];
  if (r.newCollectors.length) fields.push({ name: 'New collectors', value: String(r.newCollectors.length), inline: true });
  if (r.firstEver.length) fields.push({ name: 'First-ever pulls', value: String(r.firstEver.length), inline: true });
  if (r.tradesCompleted) fields.push({ name: 'Trades completed', value: String(r.tradesCompleted), inline: true });
  if (r.rarest) fields.push({ name: 'Rarest pull', value: printLine(r.rarest) });
  if (r.topPuller) fields.push({ name: 'Top puller', value: `**${esc(r.topPuller.username)}** with ${r.topPuller.packs} pack${r.topPuller.packs === 1 ? '' : 's'}` });
  return payload({
    color: rarity ? hexToInt(rarity.hex) : GOLD,
    title: '📼 Stream recap',
    description: `The stream ran for ${length}.${r.partial ? ' (The activity log no longer reaches the start, so these are minimums.)' : ''}`,
    fields, timestamp: new Date(r.to).toISOString(), footer: { text: opts.footer ?? 'The Cheesy TCG' },
  });
}

/** The Sunday weekly digest embed. `footer` marks a test send. */
export function buildDigestMessage(d: WeeklyDigest, opts: { footer?: string } = {}): DiscordPayload {
  const n = (x: number) => x.toLocaleString('en-US');
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Packs opened', value: n(d.pulls), inline: true },
    { name: 'New collectors', value: n(d.newCollectors), inline: true },
    { name: 'Upgrades', value: n(d.upgrades), inline: true },
    { name: 'Trades completed', value: n(d.trades), inline: true },
  ];
  const medals = ['🥇', '🥈', '🥉'];
  if (d.top.length) fields.push({ name: 'Top 3 right now', value: d.top.map((t, i) => `${medals[i]} **${esc(t.username)}**, ${n(t.points)} pts`).join('\n') });
  fields.push({
    name: 'Movers',
    value: d.movers === null ? 'Movers start next week.'
      : d.movers.length === 0 ? 'No big moves this week.'
      : d.movers.map(m => `**${esc(m.username)}**${m.climbed > 0 ? ` up ${m.climbed} to #${m.rank}` : ` #${m.rank}`}, +${n(m.gained)} pts`).join('\n'),
  });
  if (d.mostTraded.length) fields.push({ name: `Most traded cards${d.tradedAtLeast ? ' (at least)' : ''}`, value: d.mostTraded.map(c => `${esc(c.name)}, ${c.count}×`).join('\n'), inline: true });
  if (d.mostWanted) fields.push({ name: 'Most wanted card', value: `${esc(d.mostWanted.name)}, ${d.mostWanted.watchers} collector${d.mostWanted.watchers === 1 ? '' : 's'} want it`, inline: true });
  if (d.print) fields.push({ name: 'Print of the week', value: `[${esc(d.print.name)}${d.print.label ? ` (${esc(d.print.label)})` : ''}${d.print.uid ? `, Print #${d.print.uid}` : ''}](${SITE_URL}${d.print.href})\n${esc(d.print.reason)}` });
  fields.push({ name: 'Leaderboard', value: `[See the full board](${SITE_URL}/leaderboard)` });
  return payload({
    color: GOLD, title: '🧀 The week in Cheesy TCG',
    description: `${esc(d.seasonName)}, the last 7 days.`,
    fields, timestamp: new Date(d.to).toISOString(), footer: { text: opts.footer ?? 'The Cheesy TCG' },
  });
}

/** A short embed for the admin log and system channels. */
function noticeEmbed(o: { title: string; text?: string; fields?: { name: string; value: string; inline?: boolean }[]; color: number; url?: string }): DiscordPayload {
  return payload({
    color: o.color, title: o.title, ...(o.url ? { url: o.url } : {}), ...(o.text ? { description: o.text.slice(0, 1500) } : {}),
    ...(o.fields?.length ? { fields: o.fields } : {}), timestamp: new Date().toISOString(), footer: { text: 'The Cheesy TCG' },
  });
}

export function buildTestMessage(): DiscordPayload {
  return payload({
    color: GREEN,
    title: '✅ Discord webhook connected',
    description: 'This is a test message from **The Cheesy TCG**. Live activity will appear in this channel once the webhook is enabled.',
    timestamp: new Date().toISOString(),
    footer: { text: 'Test message' },
  });
}

// ── Sending ───────────────────────────────────────────────

export interface SendResult { ok: boolean; status: number; error?: string }

/** POSTs to a Discord webhook. Retries once if Discord rate-limits us briefly. Never throws. */
export async function postToDiscord(url: string, body: DiscordPayload): Promise<SendResult> {
  if (!isValidDiscordWebhookUrl(url)) return { ok: false, status: 0, error: 'That is not a Discord webhook URL.' };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { ok: true, status: res.status };

      const text = await res.text().catch(() => '');
      if (res.status === 429 && attempt === 0) {
        const retry = Number(JSON.parse(text || '{}').retry_after);
        if (retry > 0 && retry <= 5) { await new Promise(r => setTimeout(r, retry * 1000)); continue; }
      }
      let message = text.slice(0, 200);
      try { message = JSON.parse(text).message ?? message; } catch { /* not JSON */ }
      return { ok: false, status: res.status, error: message || `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }
  return { ok: false, status: 429, error: 'Rate limited by Discord' };
}

// ── Delivery log ──────────────────────────────────────────

const logKey = (channelId: string) => `discord:log:${channelId}`;

/** A channel's last sends, newest first. */
export async function getDiscordLog(channelId: string): Promise<DiscordLogEntry[]> {
  try { return (await kv.lrange<DiscordLogEntry>(logKey(channelId), 0, DISCORD_LOG_CAP - 1)) ?? []; } catch { return []; }
}

/** Keeps the result in the channel's log; a channel whose last DISCORD_LOG_CAP sends all failed is switched off. Never throws. */
async function recordDelivery(channel: DiscordChannel, kind: string, r: SendResult): Promise<void> {
  try {
    const entry: DiscordLogEntry = { at: Date.now(), kind, ok: r.ok, status: r.status, ...(r.error ? { error: r.error.slice(0, 200) } : {}) };
    await kv.lpush(logKey(channel.id), entry);
    await kv.ltrim(logKey(channel.id), 0, DISCORD_LOG_CAP - 1);
    if (r.ok) return;
    const log = await getDiscordLog(channel.id);
    if (log.length < DISCORD_LOG_CAP || !log.every(e => !e.ok)) return;
    const settings = await getDiscordSettings();
    const stored = settings.channels.find(x => x.id === channel.id);
    if (!stored?.enabled) return;
    stored.enabled = false;
    stored.offReason = `Switched off after ${DISCORD_LOG_CAP} failed sends in a row (last: ${r.error ?? `HTTP ${r.status}`})`.slice(0, 300);
    await saveDiscordSettings(settings);
    void notifyAdminLog({ action: 'Discord channel switched off', subject: stored.name, detail: stored.offReason });
  } catch { /* the log is best effort */ }
}

/** Posts to a configured channel and logs the result. */
export async function deliver(channel: DiscordChannel, body: DiscordPayload, kind: string): Promise<SendResult> {
  const result = await postToDiscord(channel.url, body);
  await recordDelivery(channel, kind, result);
  return result;
}

/** Channels the system switched off, for the dashboard. */
export async function autoDisabledChannels(): Promise<{ id: string; name: string; reason: string }[]> {
  try { return (await getDiscordSettings()).channels.filter(c => !c.enabled && c.offReason).map(c => ({ id: c.id, name: c.name, reason: c.offReason! })); } catch { return []; }
}

/** Runs after the response has been sent when inside a request (so a slow Discord never slows the action), straight away otherwise. */
function later(run: () => Promise<void>): void {
  try { after(run); } catch { void run(); }
}

/** Posts one prepared message to every channel that is on and has `category` ticked. Never throws. */
async function sendToCategory(category: DiscordCategory, body: DiscordPayload): Promise<void> {
  try {
    const settings = await getDiscordSettings();
    if (!settings.enabled) return;
    await Promise.allSettled(settings.channels.filter(c => c.enabled && c.url && c.categories[category]).map(c => deliver(c, body, category)));
  } catch { /* never breaks the action */ }
}

/** Called for every recorded activity event; posts it to every channel that is on and wants it. One channel failing never affects another. */
export async function notifyDiscord(e: ActivityEvent): Promise<void> {
  try {
    const settings = await getDiscordSettings();
    if (!settings.enabled) return;
    const targets = settings.channels.filter(c => c.enabled && c.url && shouldSend(e, c));
    if (targets.length === 0) return;
    const plain = await buildMessage(e);
    const named = e.staff && targets.some(c => c.categories.admin) ? await buildMessage(e, { showStaff: true }) : plain;
    await Promise.allSettled(targets.map(c => deliver(c, c.categories.admin && e.staff ? named : plain, e.type)));
  } catch {
    // Discord must never break the action that produced the event.
  }
}

export interface ListingNotice {
  id: string;
  from: string;
  expiresAt: number;
  /** Readable lines per side ("2× Cat (Shiny)"), the given side with its edition numbers. */
  give: string[];
  get: string[];
  givePts: number;
  getPts: number;
  /** The first given card's art. */
  imageUrl?: string;
  note?: string;
  /** Lines like "3 collectors are looking for Gouda (Shiny)", only for cards someone wants. */
  wanted?: string[];
}

/**
 * A new board listing, for channels with Trade listings on: who listed it, what they give and want, the points, when it ends and the
 * first given card's art, the title linking to the trade's page. Mentions stay empty (the channel's own notification settings do that
 * job). The post is not edited when the listing is taken or ends; the trade page shows the outcome. Silent in a sandbox.
 */
export async function notifyListing(l: ListingNotice): Promise<void> {
  try {
    if (await inSandbox()) return;
    const list = (lines: string[]) => (lines.join('\n') || '-').slice(0, 1000);
    const body = payload({
      color: BLUE,
      title: `📋 ${esc(l.from)} listed a trade`,
      url: `${SITE_URL}/trade/${encodeURIComponent(l.id)}`,
      ...(l.imageUrl ? { thumbnail: { url: absolute(cardThumbUrl(l.imageUrl)) } } : {}),
      fields: [
        { name: `Gives · ≈${l.givePts.toLocaleString()} pts`, value: list(l.give.map(esc)), inline: true },
        { name: `Wants · ≈${l.getPts.toLocaleString()} pts`, value: list(l.get.map(esc)), inline: true },
        ...(l.wanted?.length ? [{ name: 'Wanted', value: l.wanted.map(esc).join('\n').slice(0, 1000) }] : []),
        { name: 'Ends', value: `<t:${Math.floor(l.expiresAt / 1000)}:R>`, inline: true },
        ...(l.note ? [{ name: 'Note', value: esc(l.note).slice(0, 200) }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Open the title to take the trade' },
    });
    later(() => sendToCategory('listings', body));
  } catch { /* never breaks the trade */ }
}

// ── Admin log and system notices ──────────────────────────

/**
 * Audit entries that have an activity event of their own (a grant, a removal, a reset...): the admin channels already get those from
 * notifyDiscord, with the staff name, so the audit twin is skipped.
 */
const AUDIT_WITH_EVENT = new Set(['Card removed', 'Season reset', 'All seasons reset', 'Account deleted', 'Cards granted', 'Packs gifted', 'Print removed']);

export interface AdminLogEntry { action: string; subject?: string; detail?: string; /** The staff member's login ("password" for the emergency login). */ by?: string | null }

/**
 * A staff action that is not an activity event (audit entries, staff changes, season / pack / scoring / trading changes): posted to the
 * channels with the admin log on. The admin log is the one place staff names appear in Discord, so those channels should be private.
 * Silent in a sandbox. Never throws.
 */
export async function notifyAdminLog(entry: AdminLogEntry): Promise<void> {
  try {
    if (AUDIT_WITH_EVENT.has(entry.action) || (await inSandbox())) return;
    const body = noticeEmbed({
      color: GRAY,
      title: `🛡️ ${esc(entry.action)}`,
      text: [entry.subject && `**${esc(entry.subject)}**`, entry.detail && esc(entry.detail)].filter(Boolean).join('\n') || undefined,
      fields: entry.by ? [{ name: 'By', value: `@${esc(entry.by)}`, inline: true }] : [],
    });
    later(() => sendToCategory('admin', body));
  } catch { /* never breaks the action */ }
}

/** A system notice (backup result, data-health warning, sandbox, live status) for channels with System ticked. Silent in a sandbox. */
export async function notifySystem(o: { title: string; text?: string; tone?: 'good' | 'bad' | 'info'; fields?: { name: string; value: string; inline?: boolean }[] }): Promise<void> {
  try {
    if (await inSandbox()) return;
    const body = noticeEmbed({ color: o.tone === 'good' ? GREEN : o.tone === 'bad' ? RED : BLUE, title: o.title, text: o.text, fields: o.fields });
    later(() => sendToCategory('system', body));
  } catch { /* never breaks the action */ }
}

/** A new suggestion or problem report, for channels with Feedback ticked. Text is Markdown-escaped and cut, mentions stay empty, no staff names. Silent in a sandbox. */
export async function notifyFeedback(item: FeedbackItem): Promise<void> {
  try {
    if (await inSandbox()) return;
    const body = noticeEmbed({
      color: item.kind === 'bug' ? RED : GOLD,
      title: `${item.kind === 'bug' ? '🐞 Problem report' : '💡 Suggestion'} from ${esc(item.user)}`,
      url: `${SITE_URL}/u/${encodeURIComponent(item.user)}`,
      text: [discordText(item.title, 100) && `**${discordText(item.title, 100)}**`, discordText(item.body)].filter(Boolean).join('\n'),
      fields: [
        ...(item.expected ? [{ name: 'Expected', value: discordText(item.expected, 300) }] : []),
        ...(item.from ? [{ name: 'Page', value: discordText(item.from, 200), inline: true }] : []),
      ],
    });
    later(() => sendToCategory('feedback', body));
  } catch { /* never breaks the send */ }
}

/** The stream recap, for channels with Recap ticked. Silent in a sandbox and after the response when inside a request. */
export async function notifyRecap(r: StreamRecap): Promise<void> {
  try {
    if (await inSandbox()) return;
    later(() => sendToCategory('recap', buildRecapMessage(r)));
  } catch { /* never breaks the action */ }
}

/** Posts the weekly digest to every channel with Weekly digest ticked and waits for the sends (the cron calls this). Returns how many channels took it. */
export async function postDigest(d: WeeklyDigest): Promise<number> {
  try {
    const settings = await getDiscordSettings();
    if (!settings.enabled) return 0;
    const targets = settings.channels.filter(c => c.enabled && c.url && c.categories.digest);
    const results = await Promise.allSettled(targets.map(c => deliver(c, buildDigestMessage(d), 'digest')));
    return results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  } catch { return 0; }
}
