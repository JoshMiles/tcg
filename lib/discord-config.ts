// Discord feed settings types + constants. Browser-safe (no server imports) so the admin UI can use
// them; the server-side logic lives in ./discord.ts.

export type DiscordCategory = 'pulls' | 'cards' | 'stream' | 'resets';

/** One webhook (one Discord channel) with its own switch and its own choice of what to post. */
export interface DiscordChannel {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  categories: Record<DiscordCategory, boolean>;
  minStars: number;     // pulls below this rarity are skipped
  newOnly: boolean;     // pulls: only announce cards the viewer didn't have yet
}

export interface DiscordSettings {
  /** Master switch: off silences every channel. */
  enabled: boolean;
  channels: DiscordChannel[];
}

export const MAX_DISCORD_CHANNELS = 8;

export const DEFAULT_CATEGORIES: Record<DiscordCategory, boolean> = { pulls: true, cards: true, stream: false, resets: true };

export const DEFAULT_DISCORD: DiscordSettings = { enabled: false, channels: [] };

export const DISCORD_CATEGORIES: { key: DiscordCategory; label: string; hint: string }[] = [
  { key: 'pulls', label: 'Card pulls', hint: 'Every pack opened on stream' },
  { key: 'cards', label: 'Grants & removals', hint: 'Cards given or taken away by an admin or webhook' },
  { key: 'stream', label: 'Stream triggers', hint: 'Pack draws / collection views requested, and collections shown' },
  { key: 'resets', label: 'Resets & deletions', hint: 'Collections reset or users deleted' },
];

const NONE: Record<DiscordCategory, boolean> = { pulls: false, cards: false, stream: false, resets: false };

/** "Add channel" presets: a name and the boxes ticked for it. */
export const DISCORD_PRESETS: { key: string; name: string; hint: string; categories: Partial<Record<DiscordCategory, boolean>> }[] = [
  { key: 'activity', name: 'Activity', hint: 'Pulls, grants, trades and resets', categories: { pulls: true, cards: true, resets: true } },
  { key: 'pulls', name: 'Pulls', hint: 'Every card pulled on stream', categories: { pulls: true } },
  { key: 'cards', name: 'Cards', hint: 'Grants, removals, upgrades and trades', categories: { cards: true } },
  { key: 'stream', name: 'Stream', hint: 'Draws requested and collections shown', categories: { stream: true } },
];

export function newChannelId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function presetChannel(key: string): DiscordChannel {
  const p = DISCORD_PRESETS.find(x => x.key === key) ?? DISCORD_PRESETS[0];
  return { id: newChannelId(), name: p.name, url: '', enabled: false, categories: { ...NONE, ...p.categories }, minStars: 1, newOnly: false };
}

/** Steps for the "Deploys & code" card: GitHub (and so Vercel) changes posted straight to Discord, no server code involved. */
export const DEPLOY_STEPS: string[] = [
  'In Discord, make a webhook for the channel you want (Channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL).',
  'In the GitHub repository open Settings, Webhooks, Add webhook.',
  'Payload URL: the Discord webhook URL with /github added on the end. Content type: application/json.',
  'Choose individual events: Pushes, Pull requests, Releases and Deployment statuses.',
  'Vercel reports every deployment to GitHub as a deployment status, so "deployed to Production / Preview" shows up in the same channel with its link.',
];
