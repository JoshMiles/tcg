// Awards for the channel's existing channel points rewards (ROADMAP 58.3), the pure part: the award shapes, how the Events form is read and checked, the
// Helix reward list, and the one rule that switches Mix It Up's redeem event off. No KV and no site imports; lib/twitch-awards.ts holds the rest.

export type Award =
  | { kind: 'pack' }
  | { kind: 'showoff' }
  | { kind: 'buff'; buffId: string }
  | { kind: 'happyhour'; minutes: number; hh: 'free' | 'discount'; percent?: number };
export type Awards = Record<string, Award>;

/** Twitch reward ids are UUIDs; anything else is not a reward. */
export const REWARD_ID = /^[A-Za-z0-9-]{8,64}$/;
export const AWARDS_MAX = 200;
const MINUTES_MAX = 240; // the same ceiling as the happy hour box (HAPPY_MINUTES_MAX)

export const AWARD_NAMES: Record<Award['kind'] | 'none', string> = {
  none: 'None', pack: 'Open a pack', showoff: "Show the viewer's best card", buff: 'A buff', happyhour: 'Start a happy hour',
};

/** What an award does, in a few words, for the log and the recent events ("Open a pack", "Buff Lucky", "Happy hour: 25% off for 30 minutes"). */
export function awardLabel(a: Award, buffName?: string): string {
  if (a.kind === 'buff') return `Buff ${buffName || a.buffId}`;
  if (a.kind === 'happyhour') return `Happy hour: ${a.hh === 'free' ? 'free packs' : `${a.percent}% off packs`} for ${a.minutes} minute${a.minutes === 1 ? '' : 's'}`;
  return AWARD_NAMES[a.kind];
}

const whole = (v: unknown): number => (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v) : typeof v === 'number' && Number.isInteger(v) ? v : NaN);

/** One stored or posted award, or null when its shape is wrong. `usable` = the buff ids a viewer buff may use. */
export function cleanAward(raw: unknown, usable: ReadonlySet<string>): Award | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'pack' || o.kind === 'showoff') return { kind: o.kind };
  if (o.kind === 'buff') return typeof o.buffId === 'string' && usable.has(o.buffId) ? { kind: 'buff', buffId: o.buffId } : null;
  if (o.kind === 'happyhour') {
    const minutes = whole(o.minutes);
    if (!(minutes >= 1 && minutes <= MINUTES_MAX)) return null;
    if (o.hh === 'free') return { kind: 'happyhour', minutes, hh: 'free' };
    const percent = whole(o.percent);
    return o.hh === 'discount' && percent >= 1 && percent <= 99 ? { kind: 'happyhour', minutes, hh: 'discount', percent } : null;
  }
  return null;
}

/** The stored map read back: only well formed entries with a real reward id survive (a buff that is gone from the Stream Deck list is checked when it runs). */
export function normalizeAwards(raw: unknown): Awards {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Awards = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, AWARDS_MAX)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const a = o && o.kind === 'buff' && typeof o.buffId === 'string' ? cleanAward(v, new Set([o.buffId])) : cleanAward(v, new Set());
    if (REWARD_ID.test(id) && a) out[id] = a;
  }
  return out;
}

/**
 * The Events form: for each reward id posted as `aw_<id>_kind` ('none' | pack | showoff | buff | happyhour) with `aw_<id>_buff`, `_minutes`, `_hh`,
 * `_percent`. Posted rewards replace their stored award (none removes it); a stored award for a reward the form did not list stays. Any bad field
 * refuses the whole save with a message.
 */
export function cleanAwardsInput(get: (key: string) => string | undefined, ids: string[], usable: ReadonlySet<string>, stored: Awards): { ok: true; awards: Awards } | { ok: false; message: string } {
  const awards: Awards = { ...stored };
  for (const id of [...new Set(ids)].slice(0, AWARDS_MAX)) {
    if (!REWARD_ID.test(id)) return { ok: false, message: 'That is not a Twitch reward id.' };
    const kind = get(`aw_${id}_kind`) ?? 'none';
    if (kind === 'none') { delete awards[id]; continue; }
    const a = cleanAward({ kind, buffId: get(`aw_${id}_buff`), minutes: get(`aw_${id}_minutes`), hh: get(`aw_${id}_hh`), percent: get(`aw_${id}_percent`) }, usable);
    if (!a) return { ok: false, message: kind === 'buff' ? 'Choose a buff that has the Stream Deck switch on and goes to one viewer.' : kind === 'happyhour' ? 'A happy hour needs 1 to 240 minutes and free packs or a 1 to 99 percent discount.' : 'Pick an award from the list.' };
    awards[id] = a;
  }
  return Object.keys(awards).length > AWARDS_MAX ? { ok: false, message: `At most ${AWARDS_MAX} awards.` } : { ok: true, awards };
}

export interface Reward { id: string; title: string; enabled: boolean }

/** Helix GET /channel_points/custom_rewards, capped and cleaned; titles are plain text (React escapes them). */
export function parseRewards(body: unknown): Reward[] {
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
  if (!Array.isArray(data)) return [];
  return data.slice(0, AWARDS_MAX).flatMap(r => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    return o && typeof o.id === 'string' && REWARD_ID.test(o.id) && typeof o.title === 'string'
      ? [{ id: o.id, title: o.title.replace(/\p{Cc}/gu, ' ').trim().slice(0, 100), enabled: o.is_enabled !== false }] : [];
  });
}

/** The Helix address of the channel's rewards: a constant base with the broadcaster id as a query parameter. */
export function rewardsUrl(base: string, broadcasterId: string): string {
  return `${base}/helix/channel_points/custom_rewards?${new URLSearchParams({ broadcaster_id: broadcasterId })}`;
}

/** The redemption an EventSub notification carries: who, which reward (id and title). Null when it is missing either. */
export function redemptionOf(event: Record<string, unknown>): { login: string; rewardId: string; title: string } | null {
  const r = event.reward && typeof event.reward === 'object' ? (event.reward as Record<string, unknown>) : null;
  const login = typeof event.user_login === 'string' ? event.user_login : '';
  if (!r || typeof r.id !== 'string' || !REWARD_ID.test(r.id) || !login) return null;
  return { login, rewardId: r.id, title: typeof r.title === 'string' ? r.title.replace(/\p{Cc}/gu, ' ').trim().slice(0, 60) : '' };
}

/** Decision 3: Twitch handles redemptions (so Mix It Up's redeem event is ignored) while the live channel is connected and at least one reward has an award. */
export const twitchHandlesRedeem = (channel: { testing: boolean } | null, awards: Awards): boolean =>
  !!channel && !channel.testing && Object.keys(awards).length > 0;
