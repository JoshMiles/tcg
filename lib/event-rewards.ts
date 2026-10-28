// Event rewards (ROADMAP 55.4g): POST /api/webhooks/pull with an `event` (gifted-subs, bits, raid, redeem), the viewer who caused it and an
// `amount`. A switched-on event queues free packs (never charged, no limit, cooldown or queue cap) or applies a self buff once.
import { getActiveSeason } from './kv';
import { recordAudit } from './audit';
import { applyBuff, currentBuffStreamKey, getBuffDef } from './buffs';
import { getMixItUpSettings } from './mixitup';
import { queuePull } from './pull-queue';
import { phrase, refusal } from './streamdeck';
import { raidShoutout } from './raid-shoutout';
import { twitchHandlesRedemptions } from './twitch-awards';
import { cleanEventAmount, cleanEventName, eventCause, eventPacks, packsReason } from './event-rewards-core';

export interface EventAnswer { status: number; body: Record<string, unknown> }

const bad = (error: string): EventAnswer => ({ status: 400, body: { error, message: error } });
const ignored = (reason: string, message = ''): EventAnswer => ({ status: 200, body: { ok: true, ignored: true, reason, message } });

/** Runs one event request. The route has checked the secret and the username; `requestId` is handled around this by answerOnce. */
export async function runEventReward(username: string, body: Record<string, unknown>): Promise<EventAnswer> {
  const answer = await rewardFor(username, body);
  // The raid shout-out (57.6) runs after the raid reward, whether or not the raid earns a pack; it never throws.
  if (body.event === 'raid') {
    const amount = cleanEventAmount('raid', body.amount);
    if (amount !== null) await raidShoutout(username, amount);
  }
  return answer;
}

async function rewardFor(username: string, body: Record<string, unknown>): Promise<EventAnswer> {
  const event = cleanEventName(body.event);
  if (!event) return bad('event must be gifted-subs, bits, raid or redeem');
  const amount = cleanEventAmount(event, body.amount);
  if (amount === null) return bad('amount must be a whole number, 1 or more');

  const cfg = (await getMixItUpSettings()).eventRewards[event];
  if (!cfg.on) return ignored('event_off');
  // 58.3 decision 3: with the live channel connected and an award on some reward, Twitch's own redemption event handles redeems; nothing counts twice.
  // The reason shows on the Mix It Up log; the message stays empty so the command says nothing in chat.
  if (event === 'redeem' && (await twitchHandlesRedemptions())) return ignored('twitch_handles_redeem');
  const cause = eventCause(event, amount);

  if (cfg.reward === 'buff') {
    const def = cfg.buffId ? await getBuffDef(cfg.buffId) : null;
    // The same list the Stream Deck uses: a buff that is gone, switched off there or for everyone cannot be a reward.
    if (!def?.streamDeck || def.type === 'grant-achievement' || def.scope === 'community') return ignored('buff_unavailable');
    const [season, stream] = await Promise.all([getActiveSeason().catch(() => null), currentBuffStreamKey().catch(() => undefined)]);
    const r = await applyBuff(username, def.id, { source: 'event', seasonId: season?.id, streamKey: stream });
    if (!r.ok) return ignored(r.reason, refusal(r, def, username));
    await recordAudit(username, `Event reward: ${username} ${phrase(def)} for ${cause}`, def.name);
    return { status: 200, body: { ok: true, message: `${username} got ${phrase(def)} for ${cause}!` } };
  }

  const packs = eventPacks(event, cfg, amount);
  if (packs === 0) return { status: 200, body: { ok: true, message: '' } };
  // shortcut: packs queue one by one, so a failure part way leaves the earlier ones queued and a retry (same requestId) queues them again; upgrade only if that ever matters.
  const reason = packsReason(event, packs, amount);
  let queued = 0;
  let stopped: Record<string, unknown> | null = null;
  for (let i = 0; i < packs; i++) {
    const r = await queuePull(username, { free: true, reason });
    if (r.ignored) { stopped = r; break; }
    queued++;
  }
  if (queued === 0 && stopped) return { status: 200, body: stopped };
  return { status: 200, body: { ok: true, message: `${username} got ${packsReason(event, queued, amount)}!` } };
}
