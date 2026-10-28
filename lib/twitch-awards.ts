// Awards for the channel's existing channel points rewards (ROADMAP 58.3), the KV and Helix side. The awards live by reward id at
// `twitch:reward-awards`, so renaming a reward on Twitch keeps its award. A redemption that reaches the site (lib/twitch-events.ts) runs the award for the
// redeeming viewer. The site never fulfils or refunds on Twitch (it can only do that for rewards it created): a failed award is logged, recorded with the
// event and sent as a staff notice so a mod refunds it by hand.
import { kv } from './db';
import { recordAudit } from './audit';
import { applyBuff, currentBuffStreamKey, getBuffDef, getBuffDefs } from './buffs';
import { noteAwardFailed } from './bridge-notice';
import { getActiveSeason } from './kv';
import { getHappyHour, startHappyHour } from './happyhour';
import { logMixItUp } from './mixitup';
import { liveGate } from './overlay-settings';
import { queuePull } from './pull-queue';
import { queueShowOff } from './staff-actions';
import { cleanLogin } from './staff-core';
import { phrase, refusal } from './streamdeck';
import { channelAccessToken, readChannelStatus } from './twitch-channel';
import { API_URL, credentials } from './twitch-oauth';
import { awardLabel, cleanAwardsInput, normalizeAwards, parseRewards, redemptionOf, rewardsUrl, twitchHandlesRedeem, type Award, type Awards, type Reward } from './twitch-awards-core';

const AWARDS_KEY = 'twitch:reward-awards';

export const readAwards = async (): Promise<Awards> => normalizeAwards(await kv.get(AWARDS_KEY).catch(() => null));
export const saveAwards = async (a: Awards): Promise<void> => { await kv.set(AWARDS_KEY, a); };

const PAUSED_KEY = 'twitch:awards-paused';
export const AWARDS_PAUSED_WHY = 'awards paused';
export const awardsPaused = async (): Promise<boolean> => !!(await kv.get(PAUSED_KEY).catch(() => null));
/** Pauses or resumes channel point awards (58.5). True when the state changed. Redemptions are still recorded while paused; only the award is skipped. */
export async function setAwardsPaused(on: boolean): Promise<boolean> {
  if ((await awardsPaused()) === on) return false;
  if (on) await kv.set(PAUSED_KEY, 1); else await kv.del(PAUSED_KEY);
  return true;
}

/** The Stream Deck buffs an award may use: the same list as the event rewards (one viewer, switched on for the Stream Deck, not an achievement). */
export const usableBuffIds = async (): Promise<Set<string>> => new Set((await getBuffDefs()).filter(b => b.streamDeck && b.scope !== 'community' && b.type !== 'grant-achievement').map(b => b.id));

/** Checks the Events form's awards (every field, server side), saves them and writes the audit line. The caller has checked the admin. */
export async function saveRewardAwards(get: (key: string) => string | undefined, ids: string[]): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const r = cleanAwardsInput(get, ids, await usableBuffIds(), await readAwards());
  if (!r.ok) return r;
  await saveAwards(r.awards);
  const n = Object.keys(r.awards).length;
  await recordAudit('everyone', 'Channel point awards saved', `${n} reward${n === 1 ? '' : 's'} with an award`);
  return { ok: true, message: 'Channel point awards saved.' };
}

/** Is Twitch handling redemptions, so Mix It Up's `redeem` event is ignored? The live (not a test) channel is connected and a reward has an award. */
export async function twitchHandlesRedemptions(): Promise<boolean> {
  return twitchHandlesRedeem(await readChannelStatus().catch(() => null), await readAwards());
}

export type RewardList = { ok: true; rewards: Reward[] } | { ok: false; message: string };

/** The channel's rewards from Helix with the connected channel's access token (read only). A message says why when it cannot. */
export async function fetchRewards(fetchFn: typeof fetch = fetch): Promise<RewardList> {
  const t = await channelAccessToken(fetchFn);
  if (!t.ok) {
    return { ok: false, message: t.error === 'not-connected' ? 'No Twitch channel is connected. Connect one on the Connection tab to list its rewards.'
      : t.error === 'rejected' ? 'Twitch rejected the connection. Connect the channel again on the Connection tab.'
      : 'Could not get a Twitch token just now. Try again in a minute.' };
  }
  try {
    const res = await fetchFn(rewardsUrl(API_URL, t.userId), { headers: { Authorization: `Bearer ${t.accessToken}`, 'Client-Id': credentials().clientId }, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Twitch refused to list the rewards. Connect the channel again so it can read channel point rewards.' };
    if (res.status === 400 || res.status === 404) return { ok: false, message: 'This Twitch channel has no channel points rewards to list (channel points may be off, or the channel is not an affiliate or partner).' };
    if (!res.ok) return { ok: false, message: `Twitch could not list the rewards (HTTP ${res.status}). Try again in a minute.` };
    return { ok: true, rewards: parseRewards(await res.json()) };
  } catch {
    return { ok: false, message: 'Could not reach Twitch. Try again in a minute.' };
  }
}

type Done = { ok: true; text: string } | { ok: false; why: string };
const fail = (why: string): Done => ({ ok: false, why });

/** Runs one award for the viewer. Never throws. */
async function runAward(a: Award, username: string, title: string): Promise<Done> {
  try {
    if (a.kind === 'pack' || a.kind === 'showoff') {
      // The same gates as the Mix It Up request this replaces: the admin's "only when live" switches.
      const blocked = await liveGate(a.kind === 'pack' ? 'pull' : 'collection');
      if (blocked) return fail(blocked);
    }
    if (a.kind === 'pack') {
      const r = await queuePull(username, { free: true, reason: `redeemed ${title || 'a reward'}` });
      return r.ignored ? fail(String(r.reason ?? 'refused').replace(/_/g, ' ')) : { ok: true, text: `redeemed ${awardLabel(a)}` };
    }
    if (a.kind === 'showoff') {
      const r = await queueShowOff(username, '', { best: true });
      return r.ok ? { ok: true, text: `redeemed ${awardLabel(a)}` } : fail(r.message);
    }
    if (a.kind === 'buff') {
      // The same list the Stream Deck uses: a buff that is gone, switched off there or for everyone cannot be an award.
      const def = await getBuffDef(a.buffId);
      if (!def?.streamDeck || def.type === 'grant-achievement' || def.scope === 'community') return fail('That buff is no longer available.');
      const [season, stream] = await Promise.all([getActiveSeason().catch(() => null), currentBuffStreamKey().catch(() => undefined)]);
      const r = await applyBuff(username, def.id, { source: 'event', seasonId: season?.id, streamKey: stream });
      if (!r.ok) return fail(refusal(r, def, username));
      await recordAudit(username, `Channel points award: ${username} ${phrase(def)} for ${title || 'a reward'}`, def.name);
      return { ok: true, text: `redeemed ${awardLabel(a, def.name)}` };
    }
    if (await getHappyHour()) return fail('A happy hour is already running.');
    const r = await startHappyHour({ minutes: a.minutes, kind: a.hh, percent: a.percent }, `${username} (channel points)`);
    return r.ok ? { ok: true, text: `redeemed ${awardLabel(a)}` } : fail(r.message);
  } catch {
    return fail('The award hit an error.');
  }
}

export interface AwardResult { ok: boolean; text: string }

/**
 * Runs the award for a channel point redemption notification (already de-duplicated by its message id). Null = no award on that reward (ignored).
 * Otherwise a result for the recent events list: "redeemed Open a pack", or "Open a pack failed: no packs". A failure also writes the Mix It Up log
 * line and sends the staff notice (at most one a minute). Never throws.
 */
export async function awardRedemption(event: Record<string, unknown>): Promise<AwardResult | null> {
  const red = redemptionOf(event);
  if (!red) return null;
  const award = (await readAwards())[red.rewardId];
  if (!award) return null;
  const username = cleanLogin(red.login);
  const what = award.kind === 'buff' ? awardLabel(award, (await getBuffDef(award.buffId).catch(() => null))?.name) : awardLabel(award);
  // 58.5: paused = the redemption is recorded and logged, the award is not run, and the failed-award notice says why (a mod refunds it by hand).
  const done: Done = !username ? fail('That is not a Twitch name.') : (await awardsPaused()) ? fail(AWARDS_PAUSED_WHY) : await runAward(award, username, red.title);
  const who = username || red.login.slice(0, 40);
  // The `redeem` event also puts the line in the app's event feed (57.7).
  const log = (what2: 'pull' | 'buff' | 'command') => logMixItUp({ username: who, what: what2, ok: done.ok, detail: done.ok ? `Twitch channel points: ${done.text}` : `Twitch channel points: ${what} failed for ${red.title || 'a reward'}: ${done.why}` }, { name: 'redeem' });
  await log(award.kind === 'buff' ? 'buff' : award.kind === 'happyhour' ? 'command' : 'pull');
  if (done.ok) return { ok: true, text: done.text };
  await noteAwardFailed(who, red.title, done.why);
  return { ok: false, text: `${what} failed: ${done.why}` };
}
