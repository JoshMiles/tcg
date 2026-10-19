// Discord feed settings types + constants. Browser-safe (no server imports) so the admin UI can use
// them; the server-side logic lives in ./discord.ts.

/** The kinds of feedback post a channel can pick from. 'report' is the profile report of ROADMAP 17.2 (the profile menu files it). */
export type FeedbackFilterKind = 'idea' | 'bug' | 'deletion' | 'report';
export const FEEDBACK_FILTER_KINDS: FeedbackFilterKind[] = ['idea', 'bug', 'deletion', 'report'];
/** What the channel card offers as ticks. */
export const FEEDBACK_FILTER_OPTIONS: { key: FeedbackFilterKind; label: string }[] = [
  { key: 'idea', label: 'Suggestions' },
  { key: 'bug', label: 'Problems' },
  { key: 'deletion', label: 'Deletion requests' },
  { key: 'report', label: 'Reports' },
];

export type DiscordCategory = 'pulls' | 'cards' | 'upgrades' | 'trades' | 'listings' | 'recap' | 'digest' | 'feedback' | 'shares' | 'stream' | 'resets' | 'admin' | 'system';

/** One webhook (one Discord channel) with its own switch and its own choice of what to post. */
export interface DiscordChannel {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  categories: Record<DiscordCategory, boolean>;
  minStars: number;     // pulls below this rarity are skipped
  newOnly: boolean;     // pulls: only announce cards the viewer didn't have yet
  /** Feedback: which kinds of post this channel gets. Absent = all of them (so existing channels are unchanged). */
  feedbackKinds?: FeedbackFilterKind[];
  /** Set when the channel was switched off automatically after repeated failed sends (cleared when it is switched on again). */
  offReason?: string;
}

/** One send attempt, newest first in the channel's delivery log. */
export interface DiscordLogEntry { at: number; kind: string; ok: boolean; status: number; error?: string }

export const DISCORD_LOG_CAP = 20;

export interface DiscordSettings {
  /** Master switch: off silences every channel. */
  enabled: boolean;
  channels: DiscordChannel[];
}

export const MAX_DISCORD_CHANNELS = 25;

export const DEFAULT_CATEGORIES: Record<DiscordCategory, boolean> = { pulls: true, cards: true, upgrades: true, trades: true, listings: false, recap: false, digest: false, feedback: false, shares: false, stream: false, resets: true, admin: false, system: false };

/** What the share-tab button says when no channel has Shares on. */
export const SHARE_OFF_MESSAGE = 'The streamer has not turned this on.';

export const DEFAULT_DISCORD: DiscordSettings = { enabled: false, channels: [] };

export const DISCORD_CATEGORIES: { key: DiscordCategory; label: string; hint: string }[] = [
  { key: 'pulls', label: 'Card pulls', hint: 'Every pack opened on stream' },
  { key: 'cards', label: 'Grants & removals', hint: 'Cards given or taken away by an admin or webhook' },
  { key: 'upgrades', label: 'Upgrades', hint: 'Cards upgraded to a better version, with a link to the new print' },
  { key: 'trades', label: 'Trades', hint: 'Completed trades, counter-offers and admin cancels' },
  { key: 'listings', label: 'Trade listings', hint: 'New listings on the trade board, each with a link to its trade page' },
  { key: 'recap', label: 'Stream recap', hint: 'One summary after each stream: packs opened, rewards and grants, upgrades, overlay requests, new collectors, the rarest pull, the top puller and trades' },
  { key: 'digest', label: 'Weekly digest', hint: 'One post each Sunday evening: pulls, new collectors and trades, the top 3, movers, the most traded and most wanted cards and the print of the week' },
  { key: 'feedback', label: 'Feedback', hint: 'Each new suggestion and problem report, with the sender’s login (the text is cut and Markdown-escaped)' },
  { key: 'shares', label: 'Shares', hint: 'A collector posts their share image from their own profile' },
  { key: 'stream', label: 'Stream triggers', hint: 'Pack draws / collection views requested, and collections shown' },
  { key: 'resets', label: 'Resets & deletions', hint: 'Collections reset or users deleted' },
  { key: 'admin', label: 'Admin log', hint: 'What staff did, with their names (grants, removals, resets, staff changes, seasons, packs, scoring, trading paused). Keep this channel private' },
  { key: 'system', label: 'System', hint: 'Backup results, data-health warnings, sandboxes, the stream going live or offline' },
];

const NONE: Record<DiscordCategory, boolean> = { pulls: false, cards: false, upgrades: false, trades: false, listings: false, recap: false, digest: false, feedback: false, shares: false, stream: false, resets: false, admin: false, system: false };

/** "Add channel" presets: a name and the boxes ticked for it. */
export const DISCORD_PRESETS: { key: string; name: string; hint: string; categories: Partial<Record<DiscordCategory, boolean>>; feedbackKinds?: FeedbackFilterKind[] }[] = [
  { key: 'activity', name: 'Activity', hint: 'Pulls, grants, upgrades, trades and resets', categories: { pulls: true, cards: true, upgrades: true, trades: true, resets: true } },
  { key: 'pulls', name: 'Pulls', hint: 'Every card pulled on stream', categories: { pulls: true } },
  { key: 'upgrades', name: 'Upgrades', hint: 'Cards upgraded to a better version', categories: { upgrades: true } },
  { key: 'trades', name: 'Trades', hint: 'Completed trades and counter-offers', categories: { trades: true } },
  { key: 'listings', name: 'Trade listings', hint: 'New board listings, linked to the trade', categories: { listings: true } },
  { key: 'recap', name: 'Stream recap', hint: 'One summary when the stream ends', categories: { recap: true } },
  { key: 'digest', name: 'Weekly digest', hint: 'One summary every Sunday evening', categories: { digest: true } },
  { key: 'feedback', name: 'Feedback', hint: 'New suggestions and problem reports', categories: { feedback: true }, feedbackKinds: ['idea', 'bug'] },
  { key: 'shares', name: 'Shares', hint: 'Share images collectors post from their profile', categories: { shares: true } },
  { key: 'requests', name: 'Requests and reports', hint: 'Deletion requests and user reports. Keep this channel private', categories: { feedback: true }, feedbackKinds: ['deletion', 'report'] },
  { key: 'admin', name: 'Admin log', hint: 'What staff did, by name (keep it private)', categories: { admin: true } },
  { key: 'system', name: 'System', hint: 'Backups, data health, sandboxes, live status', categories: { system: true } },
  { key: 'stream', name: 'Stream', hint: 'Draws requested and collections shown', categories: { stream: true } },
];

export function newChannelId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function presetChannel(key: string): DiscordChannel {
  const p = DISCORD_PRESETS.find(x => x.key === key) ?? DISCORD_PRESETS[0];
  return { id: newChannelId(), name: p.name, url: '', enabled: false, categories: { ...NONE, ...p.categories }, minStars: 1, newOnly: false, ...(p.feedbackKinds ? { feedbackKinds: [...p.feedbackKinds] } : {}) };
}

/** Steps for the "Deploys & code" card: GitHub (and so Vercel) changes posted straight to Discord, no server code involved. */
export const DEPLOY_STEPS: string[] = [
  'In Discord, make a webhook for the channel you want (Channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL).',
  'In the GitHub repository open Settings, Webhooks, Add webhook.',
  'Payload URL: the Discord webhook URL with /github added on the end. Content type: application/json.',
  'Choose individual events: Pushes, Pull requests, Releases and Deployment statuses.',
  'Vercel reports every deployment to GitHub as a deployment status, so "deployed to Production / Preview" shows up in the same channel with its link.',
];
