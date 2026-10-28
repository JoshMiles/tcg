// Mix It Up command check (ROADMAP 57.8), the pure part: which Mix It Up commands the site expects, and which of them the app reported.
// The app reports only the enabled commands, each with an id and a name (no Web Request address), so a command is matched by name and a
// missing one cannot be told from a switched-off one. Nothing here calls Mix It Up or changes it.
import { EVENT_SETUP, type EventRewards } from './event-rewards-core';

export type ExpectedKind = 'pack' | 'chat' | 'deck' | 'event';
/** `name` is what the command must be called in Mix It Up (the name the downloads and setup cards use); chat commands are written without the !. */
export interface ExpectedCommand { name: string; kind: ExpectedKind }
export interface CommandCheckRow extends ExpectedCommand { found: boolean }

/** How a command is written for people: chat words get their !. */
export const commandLabel = (c: ExpectedCommand): string => (c.kind === 'pack' || c.kind === 'chat' ? `!${c.name}` : c.name);

const norm = (s: string) => s.trim().replace(/^!/, '').toLowerCase();

/** The built-in !pack, every switched-on chat command, every buff with the Stream Deck switch on, and the event commands of the switched-on event rewards (the raid one also for the raid shout-out). Stream Deck quick actions and the stream start and end events have no switch on the site, so they are not expected. */
export function expectedCommands(i: { chat: { name: string; enabled: boolean }[]; buffs: { name: string; streamDeck?: boolean }[]; events: EventRewards }): ExpectedCommand[] {
  const out: ExpectedCommand[] = [{ name: 'pack', kind: 'pack' }];
  for (const c of i.chat) if (c.enabled && c.name.trim()) out.push({ name: c.name.trim(), kind: 'chat' });
  for (const b of i.buffs) if (b.streamDeck && b.name.trim()) out.push({ name: b.name.trim(), kind: 'deck' });
  for (const s of EVENT_SETUP) if (i.events[s.event].on || (s.event === 'raid' && i.events.raidShoutout.on)) out.push({ name: s.title, kind: 'event' });
  const seen = new Set<string>();
  return out.filter(c => { const k = `${c.kind === 'pack' || c.kind === 'chat' ? 'chat' : c.kind}:${norm(c.name)}`; return !seen.has(k) && !!seen.add(k); });
}

/** Each expected command found or not among the enabled commands the app reported (names compared without case or a leading !). */
export function checkCommands(expected: ExpectedCommand[], reported: { name: string }[]): CommandCheckRow[] {
  const have = new Set(reported.map(c => norm(c.name)));
  return expected.map(c => ({ ...c, found: have.has(norm(c.name)) }));
}

/** The names to fix, as people write them, in the order checked. */
export const missingLabels = (rows: CommandCheckRow[]): string[] => rows.filter(r => !r.found).map(commandLabel);

/** "2 Mix It Up commands missing" (null when none are). */
export function missingSummary(rows: CommandCheckRow[]): string | null {
  const n = rows.filter(r => !r.found).length;
  return n === 0 ? null : `${n} Mix It Up command${n === 1 ? '' : 's'} missing`;
}
