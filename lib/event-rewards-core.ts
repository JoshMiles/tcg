// Event rewards (ROADMAP 55.4g): what a Mix It Up event (gifted subs, bits, a raid, a channel point redeem) earns the viewer who caused it.
// Pure (no database, no network), so the settings form, the webhook and scripts/check-event-rewards.mts share it.

export const EVENT_NAMES = ['gifted-subs', 'bits', 'raid', 'redeem'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export interface EventReward {
  on: boolean;
  reward: 'packs' | 'buff';
  /** The self buff to apply when `reward` is 'buff'. */
  buffId?: string;
  /** Bits per pack (bits) or the raid viewers needed for a pack (raid). Unused by the other two. */
  every?: number;
}
/** The raid shout-out (ROADMAP 57.6): a raid of `minViewers` or more shows the raider's best card on the overlay and says one line in chat. */
export interface RaidShoutout { on: boolean; minViewers: number }
export type EventRewards = Record<EventName, EventReward> & { raidShoutout: RaidShoutout };

/** Packs one event request can queue, whatever the amount. */
export const EVENT_PACK_CAP = 10;
export const EVENT_AMOUNT_MAX = 1_000_000_000;
export const EVERY_MAX = 1_000_000;

export const EVENT_INFO: Record<EventName, { label: string; every?: { label: string; default: number } }> = {
  'gifted-subs': { label: 'Gifted subs' },
  bits: { label: 'Bits', every: { label: 'Bits per pack', default: 500 } },
  raid: { label: 'Raid', every: { label: 'Raid viewers needed for a pack', default: 1 } },
  redeem: { label: 'Channel point redeem' },
};

export const DEFAULT_EVENT_REWARDS: EventRewards = {
  'gifted-subs': { on: false, reward: 'packs' },
  bits: { on: false, reward: 'packs', every: 500 },
  raid: { on: false, reward: 'packs', every: 1 },
  redeem: { on: false, reward: 'packs' },
  raidShoutout: { on: false, minViewers: 5 },
};

const whole = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) ? n : NaN;
};

/** Whatever is stored (or nothing), as a complete, safe set of four rewards. */
export function normalizeEventRewards(raw: unknown): EventRewards {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as EventRewards;
  for (const name of EVENT_NAMES) {
    const e = (r[name] && typeof r[name] === 'object' ? r[name] : {}) as Record<string, unknown>;
    const d = DEFAULT_EVENT_REWARDS[name];
    const every = whole(e.every);
    const buffId = typeof e.buffId === 'string' ? e.buffId.trim().slice(0, 80) : '';
    out[name] = {
      on: e.on === true,
      reward: e.reward === 'buff' && buffId ? 'buff' : 'packs',
      ...(buffId ? { buffId } : {}),
      ...(d.every !== undefined ? { every: every >= 1 ? Math.min(EVERY_MAX, every) : d.every } : {}),
    };
  }
  const s = (r.raidShoutout && typeof r.raidShoutout === 'object' ? r.raidShoutout : {}) as Record<string, unknown>;
  const min = whole(s.minViewers);
  out.raidShoutout = { on: s.on === true, minViewers: min >= 1 ? Math.min(EVERY_MAX, min) : DEFAULT_EVENT_REWARDS.raidShoutout.minViewers };
  return out;
}

/** The Events form (`ev_<event>_on`, `_reward`, `_buff`, `_every`) as rewards, or the first problem in words. A blank number means the default. */
export function cleanEventRewardsInput(get: (key: string) => string | undefined): { ok: true; rewards: EventRewards } | { ok: false; message: string } {
  const raw: Record<string, unknown> = {};
  for (const name of EVENT_NAMES) {
    const info = EVENT_INFO[name];
    const every = (get(`ev_${name}_every`) ?? '').trim();
    if (info.every && every !== '' && !(whole(every) >= 1 && whole(every) <= EVERY_MAX)) return { ok: false, message: `${info.every.label} must be a whole number, 1 to ${EVERY_MAX.toLocaleString('en-US')}.` };
    const reward = get(`ev_${name}_reward`) === 'buff' ? 'buff' : 'packs';
    const buffId = (get(`ev_${name}_buff`) ?? '').trim();
    if (reward === 'buff' && !buffId) return { ok: false, message: `${info.label}: choose a buff, or give packs.` };
    raw[name] = { on: get(`ev_${name}_on`) === 'on', reward, buffId, every: every === '' ? undefined : every };
  }
  const min = (get('ev_shout_min') ?? '').trim();
  if (min !== '' && !(whole(min) >= 1 && whole(min) <= EVERY_MAX)) return { ok: false, message: `Raid shout-out: the minimum raid size must be a whole number, 1 to ${EVERY_MAX.toLocaleString('en-US')}.` };
  raw.raidShoutout = { on: get('ev_shout_on') === 'on', minViewers: min === '' ? undefined : min };
  return { ok: true, rewards: normalizeEventRewards(raw) };
}

/** The overlay caption over the raider's card. */
export const shoutoutCaption = (raider: string): string => `Raid from ${raider}`;

/** The one chat line: "Welcome, raiders! cheesy brought 12 viewers. Their best card: Shiny Gouda." */
export const shoutoutChatLine = (raider: string, viewers: number, card: string): string =>
  `Welcome, raiders! ${raider} brought ${plural(viewers, 'viewer')}. Their best card: ${card}.`;

/** The request's event, or null when it is not one of the four. */
export const cleanEventName = (v: unknown): EventName | null => (EVENT_NAMES as readonly unknown[]).includes(v) ? (v as EventName) : null;

/** The request's amount: a whole number from 1 (a number or text such as "300", which is what Mix It Up sends). A redeem may leave it out (1). Null = not usable. */
export function cleanEventAmount(event: EventName, v: unknown): number | null {
  if ((v === undefined || v === null || v === '') && event === 'redeem') return 1;
  const n = whole(v);
  return n >= 1 && n <= EVENT_AMOUNT_MAX ? n : null;
}

/** How many packs this event is worth (0 to EVENT_PACK_CAP). */
export function eventPacks(event: EventName, cfg: EventReward, amount: number): number {
  const every = Math.max(1, cfg.every ?? 1);
  const n = event === 'gifted-subs' ? amount : event === 'bits' ? Math.floor(amount / every) : event === 'raid' ? (amount >= every ? 1 : 0) : 1;
  return Math.min(EVENT_PACK_CAP, n);
}

const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

/** What caused it: "300 bits", "a raid of 12", "5 gifted subs", "a channel point redeem". */
export function eventCause(event: EventName, amount: number): string {
  if (event === 'gifted-subs') return amount === 1 ? 'a gifted sub' : plural(amount, 'gifted sub');
  if (event === 'bits') return plural(amount, 'bit');
  if (event === 'raid') return `a raid of ${amount.toLocaleString('en-US')}`;
  return 'a channel point redeem';
}

/** "3 packs for 300 bits", "a pack for a raid of 12": the line for the log, the live feed and chat. */
export const packsReason = (event: EventName, packs: number, amount: number): string => `${packs === 1 ? 'a pack' : `${packs} packs`} for ${eventCause(event, amount)}`;

export interface EventSetup { event: EventName; title: string; note: string; fields: Record<string, string> }

/** The Web Request body for each Mix It Up event command (the secret is added by the page). Identifiers: see docs/admin/mixitup.md. */
export const EVENT_SETUP: EventSetup[] = [
  { event: 'gifted-subs', title: 'Gifted sub (one at a time)', fields: { event: 'gifted-subs', username: '$username', amount: '1' },
    note: 'Event: Twitch, Subscription Gifted. $username is the gifter. In Mix It Up\'s source this event does not run for subs that were part of a mass gift, so it does not double count with the next card. Anonymous gifters cannot be rewarded.' },
  { event: 'gifted-subs', title: 'Gifted subs (several at once)', fields: { event: 'gifted-subs', username: '$username', amount: '$subsgiftedamount' },
    note: 'Event: Twitch, Mass Subscriptions Gifted. $username is the gifter and $subsgiftedamount how many subs they gave. Set up both gifted sub cards.' },
  { event: 'bits', title: 'Bits', fields: { event: 'bits', username: '$username', amount: '$bitsamount' },
    note: 'Event: Twitch, Bits Cheered. $username is the cheerer and $bitsamount the bits in that cheer.' },
  { event: 'raid', title: 'Raid', fields: { event: 'raid', username: '$username', amount: '$raidviewercount' },
    note: 'Event: Twitch, Channel Raided. $username is the raider and $raidviewercount the viewers they brought.' },
  { event: 'redeem', title: 'Channel point redeem', fields: { event: 'redeem', username: '$username', amount: '1' },
    note: 'Event: Twitch, Channel Points Redeemed. $username is the redeemer; $rewardname is the reward. In Mix It Up\'s source this event runs for every redeem, so every reward would earn a pack. To reward only one, put this Web Request on that reward\'s own Channel Points command instead (the event is then not needed).' },
];
