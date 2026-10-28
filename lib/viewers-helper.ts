// The "Mix It Up commands" helper at the top of What viewers get (ROADMAP 63.3): every ready-made command a viewer-facing card needs in Mix It Up, as one list
// of downloads. The address and secret are shown once above the list, and the staff-only download route puts them in each file, so none of this holds the secret.
// Pure: scripts/check-viewers-cards.mts covers it.
import { EVENT_SETUP } from './event-rewards-core';
import { commandSetups, packSetup, REQUEST_ID } from './mixitup-setup';
import type { PresetSpec } from './mixitup-presets';

export interface HelperPreset { title: string; note: string; spec: PresetSpec }
export interface HelperGroup { id: string; label: string; presets: HelperPreset[] }

export interface HelperInput {
  /** The saved chat commands. */
  commands: { name: string; enabled: boolean; aliases?: string[]; action?: Parameters<typeof commandSetups>[0][number]['action'] }[];
  /** Buffs with the Stream Deck switch on: the id, the name, whether it goes to everyone and one line saying what it does. */
  deckBuffs: { id: string; name: string; community: boolean; note: string }[];
}

/** The quick actions of the Stream Deck (they call the buff webhook with `action`). */
export const QUICK_ACTIONS: { title: string; note: string; fields: Record<string, string> }[] = [
  { title: 'Extra pulls this stream', note: "Adds to everyone's pulls until the stream ends. amount 0 clears it.", fields: { action: 'stream-pulls', amount: '1' } },
  { title: 'Happy hour', note: 'Cheaper paid pulls for a while. amount = minutes (1 to 240); add percent (1 to 99) for a discount, leave it out for free packs. amount 0 ends it.', fields: { action: 'happy-hour', amount: '30', percent: '50' } },
  { title: 'Free pack', note: 'Opens one pack that never charges. Use target viewer with a username to pick the viewer.', fields: { action: 'free-pack', target: 'last-pull' } },
];

/** Every download the helper lists, in groups: !pack, chat commands, Stream Deck buffs, quick actions, event commands. */
export function helperGroups(i: HelperInput): HelperGroup[] {
  const group = (title: string, note: string, path: 'buff', fields: Record<string, string>): HelperPreset => {
    const all = { ...fields, requestId: REQUEST_ID };
    return { title, note, spec: { kind: 'group', name: title, path, fields: all, reply: ['message'] } };
  };
  return [
    { id: 'pack', label: '!pack', presets: [{ title: '!pack', note: 'Opens a pack for the viewer; !pack <name> opens that pack.', spec: packSetup('', '').preset }] },
    { id: 'commands', label: 'Chat commands', presets: commandSetups(i.commands, '', '').map(c => ({ title: c.command, note: 'A chat command from the Chat commands card.', spec: c.preset })) },
    { id: 'buffs', label: 'Stream Deck buffs', presets: i.deckBuffs.map(b => group(b.name, b.note, 'buff', { buff: b.id, target: b.community ? 'everyone' : 'last-pull' })) },
    { id: 'quick', label: 'Quick actions', presets: QUICK_ACTIONS.map(a => group(a.title, a.note, 'buff', a.fields)) },
    {
      id: 'events', label: 'Event commands', presets: [
        ...([['Stream start', 'live'], ['Stream end', 'offline']] as const).map(([title, event]): HelperPreset => ({ title, note: 'Mix It Up event: tells the site the stream is live (or over) straight away.', spec: { kind: 'event', name: title, path: 'stream', fields: { event }, event } })),
        ...EVENT_SETUP.map((s): HelperPreset => ({ title: s.title, note: s.note, spec: { kind: 'group', name: s.title, path: 'pull', fields: { ...s.fields, requestId: REQUEST_ID }, reply: ['message'] } })),
      ],
    },
  ];
}
