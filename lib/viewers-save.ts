// The save functions behind the What viewers get cards (ROADMAP 63.3). Each card posts only its own fields, so each function here lays them over what is saved
// and leaves every other field as it was; the server actions only add the admin check, the audit line and the redirect. Every check is the one the single
// forms had. scripts/check-viewers-cards.mts saves one card after another against a mock KV and looks at what the others kept.
import { cleanMixItUpInput } from './mixitup-core';
import { getMixItUpSettings, saveMixItUpSettings } from './mixitup';
import { readBridge } from './bridge';
import { cleanEventRewardsInput, EVENT_NAMES } from './event-rewards-core';
import { getBuffDefs } from './buffs';
import { normalizeChat } from './bridge-chat-core';

export type SaveResult = { ok: true } | { ok: false; message: string };
export type Fields = Record<string, string>;

/**
 * The Paid pulls card ('paid': the switch, price, limits, first pack free, messages) or the Connection form ('connection': how the site reaches Mix It Up, the
 * currency, the addresses). The two switches are checkboxes, which a form leaves out when off, so only the card that shows one reads it; the rest stays.
 */
export async function savePaidFields(fields: Fields, form: 'paid' | 'connection'): Promise<SaveResult> {
  const cur = await getMixItUpSettings();
  const r = cleanMixItUpInput({ ...cur, ...fields, enabled: form === 'paid' ? fields.enabled === 'on' : cur.enabled, firstPackFree: form === 'paid' ? fields.firstPackFree === 'on' : cur.firstPackFree });
  if (!r.ok) return r;
  if (r.settings.connection === 'bridge') { // the currency's name comes from what the bridge announced
    const c = (await readBridge()).currencies.find(x => x.id === r.settings.currencyId);
    if (c) r.settings.currency = c.name;
  }
  await saveMixItUpSettings(r.settings);
  return { ok: true };
}

/**
 * The Event rewards card (`part` 'events': gifted subs, bits, raid, redeem) or the Raid shout-out card ('shoutout'). A buff must be one the Stream Deck can apply
 * to one viewer. The other card's rewards stay as saved.
 */
export async function saveEventRewards(get: (key: string) => string | undefined, part: 'events' | 'shoutout'): Promise<SaveResult> {
  const cur = await getMixItUpSettings();
  const r = cleanEventRewardsInput(get, part, cur.eventRewards);
  if (!r.ok) return r;
  if (part === 'events') {
    const usable = new Set((await getBuffDefs()).filter(b => b.streamDeck && b.scope !== 'community' && b.type !== 'grant-achievement').map(b => b.id));
    for (const name of EVENT_NAMES) {
      const e = r.rewards[name];
      if (e.reward === 'buff' && !usable.has(e.buffId ?? '')) return { ok: false, message: 'Choose a buff that has the Stream Deck switch on and goes to one viewer.' };
    }
  }
  await saveMixItUpSettings({ ...cur, eventRewards: r.rewards });
  return { ok: true };
}

/** The Stream start and end card ('lines': both posts) or the Brie Bucks safety panel ('safety': the backup and the check). Unticked means off; the other part stays. */
export async function saveChat(get: (key: string) => string | undefined, part: 'lines' | 'safety'): Promise<{ ok: true; chat: ReturnType<typeof normalizeChat> }> {
  const cur = await getMixItUpSettings();
  const on = (k: string) => get(k) === 'on';
  const chat = part === 'lines'
    ? normalizeChat({ ...cur.chat, startOn: on('startOn'), startText: get('startText'), endOn: on('endOn'), endText: get('endText') })
    : normalizeChat({ ...cur.chat, backup: on('backup'), check: on('check') });
  await saveMixItUpSettings({ ...cur, chat });
  return { ok: true, chat };
}
