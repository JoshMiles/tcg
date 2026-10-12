import { kv } from './db';
import type { ActivityEvent } from './activity';
import { getActiveSeasonWithPacks } from './kv';
import { cardThumbUrl } from './card-art';
import { getRarity } from './rarity';
import { getAvatars, sizeTwitchAvatar } from './avatars';
import { VARIANT_LABELS } from './variants';
import { SITE_URL } from './site';
import { DEFAULT_DISCORD, type DiscordCategory, type DiscordSettings } from './discord-config';

export { DISCORD_CATEGORIES, DEFAULT_DISCORD } from './discord-config';
export type { DiscordCategory, DiscordSettings } from './discord-config';

// Posts the live activity feed to a Discord channel through an incoming webhook.
// Settings live in KV (`discord:settings`); events arrive from recordActivity() in lib/activity.ts.

const KEY = 'discord:settings';

function normalize(s: Partial<DiscordSettings> | null): DiscordSettings {
  return {
    url: typeof s?.url === 'string' ? s.url : '',
    enabled: !!s?.enabled,
    categories: { ...DEFAULT_DISCORD.categories, ...(s?.categories ?? {}) },
    minStars: Math.min(5, Math.max(1, Number(s?.minStars) || 1)),
    newOnly: !!s?.newOnly,
  };
}

export async function getDiscordSettings(): Promise<DiscordSettings> {
  return normalize(await kv.get<Partial<DiscordSettings>>(KEY));
}

export async function saveDiscordSettings(s: DiscordSettings): Promise<void> {
  await kv.set(KEY, normalize(s));
}

/**
 * Only real Discord webhook URLs are accepted — the server POSTs to whatever is stored here, so an
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
    case 'remove':
    case 'upgrade':
    case 'trade': return 'cards';
    case 'trigger':
    case 'collection_shown': return 'stream';
    default: return 'resets'; // reset, delete
  }
}

export function shouldSend(e: ActivityEvent, s: DiscordSettings): boolean {
  if (!s.categories[categoryOf(e)]) return false;
  // Offers, counters, completed trades and admin cancels are worth a post; a viewer declining, withdrawing or letting one expire is noise.
  if (e.type === 'trade' && !(e.action === 'offered' || e.action === 'countered' || e.action === 'accepted' || e.by === 'admin')) return false;
  if (e.type === 'pull') {
    if (e.stars < s.minStars) return false;
    if (s.newOnly && !e.isNew) return false;
  }
  return true;
}

// ── Message building ──────────────────────────────────────

interface Embed {
  title?: string;
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
const hexToInt = (hex: string) => parseInt(hex.replace('#', ''), 16);
const absolute = (url: string) => (url.startsWith('/') ? SITE_URL + url : url);

function payload(embed: Embed): DiscordPayload {
  return { username: 'TCG Activity', allowed_mentions: { parse: [] }, embeds: [embed] };
}

/** Builds the Discord message for an activity event (looks up card art and the viewer's avatar). */
export async function buildMessage(e: ActivityEvent, opts: { footer?: string } = {}): Promise<DiscordPayload> {
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
  const thumb = (imageUrl?: string): Pick<Embed, 'thumbnail'> =>
    imageUrl ? { thumbnail: { url: absolute(cardThumbUrl(imageUrl)) } } : {};

  switch (e.type) {
    case 'pull': {
      const card = cardFor(e.cardNumber, e.packName);
      const rarity = getRarity(e.stars);
      return payload({
        ...base,
        ...thumb(card?.imageUrl),
        color: rarity ? hexToInt(rarity.hex) : GOLD,
        title: `${'★'.repeat(e.stars)} ${esc(e.cardName || card?.name || `#${e.cardNumber}`)}`,
        description: `**${esc(e.username)}** pulled ${/^[aeiou]/i.test(rarity?.label ?? '') ? 'an' : 'a'} **${rarity?.label ?? 'card'}** card${e.variant && e.variant !== 'regular' ? ` — ✨ **${VARIANT_LABELS[e.variant]}**` : ''}${e.isNew ? ' — **NEW!**' : e.copies > 1 ? ` — ×${e.copies}` : ''}`,
        fields: [
          { name: 'Pack', value: esc(e.packName) || '—', inline: true },
          { name: 'Collected', value: totalCards ? `${e.uniqueOwned}/${totalCards}` : String(e.uniqueOwned), inline: true },
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
      return payload({ ...base, ...thumb(card?.imageUrl), color: GOLD, title: '✨ Card upgraded',
        description: `**${esc(e.username)}** upgraded **${esc(e.cardName || card?.name || `#${e.cardNumber}`)}** to **${VARIANT_LABELS[e.to]}** (${e.cost}× ${VARIANT_LABELS[e.from]})` });
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
      const list = (lines: string[]) => (lines.join('\n') || '—').slice(0, 1000);
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
        title: gifted ? '🎁 Packs gifted' : e.kind === 'pull' ? '⚡ Pack draw requested' : '📖 Collection view requested',
        description: gifted
          ? `${(e.count ?? 1) > 1 ? `${e.count} packs` : 'A pack'} gifted to **${esc(e.username)}**`
          : `**${esc(e.username)}** — ${e.source === 'admin' ? 'by an admin' : 'via webhook'}` });
    }
    case 'collection_shown':
      return payload({ ...base, color: BLUE, title: '📺 Collection shown', description: `**${esc(e.username)}**'s collection was shown on stream` });
  }
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

/** Called for every recorded activity event; posts it if Discord is enabled and the event passes the filters. */
export async function notifyDiscord(e: ActivityEvent): Promise<void> {
  try {
    const settings = await getDiscordSettings();
    if (!settings.enabled || !settings.url || !shouldSend(e, settings)) return;
    await postToDiscord(settings.url, await buildMessage(e));
  } catch {
    // Discord must never break the action that produced the event.
  }
}
