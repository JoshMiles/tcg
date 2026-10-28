// The raid shout-out (ROADMAP 57.6): a raid of the set size or more puts the raider's best card on the overlay ("Raid from <name>") and says one
// line in chat. Called by the Mix It Up raid event (lib/event-rewards.ts); Track 58.4 calls it from the Twitch raid event the same way.
import { kv } from './db';
import { recordAudit } from './audit';
import { bridgeSay } from './bridge';
import { getMixItUpSettings, currentStreamKey } from './mixitup';
import { queueShowOff } from './staff-actions';
import { getHiddenUsers } from './user-admin';
import { shoutoutCaption, shoutoutChatLine } from './event-rewards-core';
import { VARIANT_LABELS } from './variants';
import type { Variant } from './types';

const TTL_S = 2 * 24 * 3600;

/**
 * Returns what happened ('shown' or why nothing did). Never throws: a shout-out must not break the raid reward. Nothing is shown for a raid
 * under the minimum, a private or hidden profile, a raider with no cards, or a second raid from the same raider this stream.
 */
export async function raidShoutout(raider: string, viewers: number): Promise<string> {
  try {
    const cfg = (await getMixItUpSettings()).eventRewards.raidShoutout;
    if (!cfg.on) return 'off';
    if (viewers < cfg.minViewers) return 'too_small';
    const login = raider.toLowerCase();
    if ((await getHiddenUsers()).has(login)) return 'private';
    const key = `raidshout:${await currentStreamKey()}:${login}`;
    if ((await kv.set(key, 1, { nx: true, ex: TTL_S })) === null) return 'already_done';
    const shown = await queueShowOff(login, '', { best: true, caption: shoutoutCaption(raider) });
    if (!shown.ok) { await kv.del(key); return 'no_card'; } // no cards, no season or a show-off cooldown: a later raid may still try
    const card = `${shown.variant === 'regular' ? '' : `${VARIANT_LABELS[shown.variant as Variant]} `}${shown.card}`;
    await bridgeSay(shoutoutChatLine(raider, viewers, card));
    await recordAudit(login, `Raid shout-out: ${raider} (${viewers} viewers)`, card);
    return 'shown';
  } catch (e) {
    console.error('[raid-shoutout] failed:', e instanceof Error ? e.message : e);
    return 'error';
  }
}
