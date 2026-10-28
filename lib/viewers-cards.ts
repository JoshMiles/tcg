// The "What viewers get" cards (ROADMAP 63.3), the pure part: the nine cards in order, where every old tab id lands, the address of a card, and each card's
// one-line summary worked out from the saved settings. No database, no network: scripts/check-viewers-cards.mts covers it.
import type { IconName } from '@/app/components/Icon';
import type { MixItUpSettings } from './mixitup-core';
import { EVENT_NAMES, EVENT_INFO } from './event-rewards-core';

export const CARDS = [
  { id: 'paid', label: 'Paid pulls', icon: 'coins' as IconName, line: 'Viewers spend Brie Bucks in Mix It Up to open a pack on stream.' },
  { id: 'packs', label: '!pack packs', icon: 'list' as IconName, line: 'Viewers type !pack and a pack name to pick what they open.' },
  { id: 'events', label: 'Event rewards', icon: 'gift' as IconName, line: 'Gifted subs, bits and raids give free packs or a buff.' },
  { id: 'shoutout', label: 'Raid shout-out', icon: 'radio' as IconName, line: "Shows the raider's best card on the overlay and says thanks in chat." },
  { id: 'points', label: 'Channel points', icon: 'zap' as IconName, line: "Pick what each of the channel's rewards gives the viewer who redeems it." },
  { id: 'startend', label: 'Stream start and end', icon: 'chat' as IconName, line: 'Chat lines TCG Bridge posts when the stream starts and ends.' },
  { id: 'bigpulls', label: 'Big pull rules', icon: 'sparkles' as IconName, line: 'What happens on stream when a viewer pulls a rare card.' },
  { id: 'commands', label: 'Chat commands', icon: 'chat' as IconName, line: 'Commands viewers can type in chat, such as !showoff and !stats.' },
  { id: 'streamdeck', label: 'Stream Deck buffs', icon: 'gamepad' as IconName, line: 'Buttons that apply a buff, give extra pulls or a free pack.' },
] as const;
export type CardId = (typeof CARDS)[number]['id'];

/** Every id the old Mix It Up tabs had in `?tab=` that is now a card, and the card that holds it. `chat` was Chat and Brie Bucks: its start and end lines are a card now. */
export const OLD_TAB_CARD: Record<string, CardId> = { paid: 'paid', bigpulls: 'bigpulls', chat: 'startend', commands: 'commands', streamdeck: 'streamdeck', events: 'events' };

export const pickCard = (raw: string | undefined): CardId | null => CARDS.find(c => c.id === raw)?.id ?? null;
/** The card to open for a `?card=` value, else for an old `?tab=` id. */
export const cardFor = (cardRaw: string | undefined, tabRaw: string | undefined): CardId | null =>
  pickCard(cardRaw) ?? (tabRaw && Object.hasOwn(OLD_TAB_CARD, tabRaw) ? OLD_TAB_CARD[tabRaw] : null);

/** The address of one card; every redirect after a save and every link to a card uses it. */
export const cardHref = (id: CardId): string => `/admin/stream?section=viewers&card=${id}`;

export interface CardSummary { on: boolean; text: string }
export interface SummaryInput {
  settings: MixItUpSettings;
  /** Packs with cards in the active season. */
  packCount: number;
  /** The saved chat commands. */
  commands: { name: string; enabled: boolean }[];
  /** Names of the buffs that answer the Stream Deck. */
  deckBuffs: string[];
  /** The channel's channel point reward ids (empty when Twitch cannot list them; null when not asked, which is the grid: Twitch is only called when the card is open) and the saved awards. */
  rewardIds: string[] | null;
  awardIds: string[];
}

const num = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, w: string) => `${num(n)} ${w}${n === 1 ? '' : 's'}`;
/** "a, b and 2 more" (first `show` names). */
const names = (list: string[], show = 3): string => (list.length <= show ? list.join(', ') : `${list.slice(0, show).join(', ')} and ${list.length - show} more`);

export function cardSummaries(i: SummaryInput): Record<CardId, CardSummary> {
  const s = i.settings;
  const limit = s.roleLimits.regular ?? s.limit;
  const ev = EVENT_NAMES.filter(n => s.eventRewards[n].on);
  const rules = s.pullRules;
  const cmds = i.commands.filter(c => c.enabled).map(c => `!${c.name}`);
  const given = i.rewardIds?.length ? i.rewardIds.filter(id => i.awardIds.includes(id)).length : i.awardIds.length;
  const sh = s.eventRewards.raidShoutout;
  return {
    paid: s.enabled
      ? { on: true, text: `${num(s.cost)} ${s.currency} a pull, ${limit > 0 ? `${num(limit)} per viewer each stream` : 'no limit per viewer'}` }
      : { on: false, text: 'Off: viewers pull for free' },
    packs: { on: i.packCount > 0, text: i.packCount > 0 ? `${plural(i.packCount, 'pack')} viewers can ask for by name` : 'No pack with cards to open' },
    events: ev.length
      ? { on: true, text: `${ev.length} of ${EVENT_NAMES.length} events give something: ${names(ev.map(n => EVENT_INFO[n].label.toLowerCase()), 4)}` }
      : { on: false, text: 'All off: no event gives anything' },
    shoutout: sh.on ? { on: true, text: `On for raids of ${num(sh.minViewers)} or more viewers` } : { on: false, text: 'Off' },
    points: i.rewardIds === null
      ? { on: given > 0, text: given > 0 ? `${plural(given, 'reward')} give${given === 1 ? 's' : ''} something` : 'No reward gives anything yet' }
      : i.rewardIds.length
        ? { on: given > 0, text: `${given} of ${i.rewardIds.length} rewards give something` }
        : { on: given > 0, text: given > 0 ? `${plural(given, 'award')} saved (rewards not listed right now)` : 'No channel points rewards to show' },
    startend: s.chat.startOn || s.chat.endOn
      ? { on: true, text: [s.chat.startOn ? 'Says hello when the stream starts' : '', s.chat.endOn ? 'posts the top pull when it ends' : ''].filter(Boolean).join('; ').replace(/^./, c => c.toUpperCase()) }
      : { on: false, text: 'Both lines are off' },
    bigpulls: rules.length ? { on: rules.some(r => r.on), text: `${plural(rules.length, 'rule')}, ${rules.filter(r => r.on).length} on` } : { on: false, text: 'No rules yet' },
    commands: cmds.length ? { on: true, text: `${plural(cmds.length, 'command')} on: ${names(cmds)}` } : { on: false, text: i.commands.length ? 'All commands are off' : 'No commands yet' },
    streamdeck: i.deckBuffs.length ? { on: true, text: `${plural(i.deckBuffs.length, 'buff')} on the Stream Deck: ${names(i.deckBuffs)}` } : { on: false, text: 'No buff answers the Stream Deck yet' },
  };
}
