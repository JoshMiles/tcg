// The Stream page's Connections section (ROADMAP 63.4), the pure part: the six connections, their addresses, and the dot and one-line state of each
// in the list. Built only from what the page already reads (the three status cards, paired PCs, the Twitch channel, the command check, the error list).
// No database, no network: scripts/check-stream-page.mts covers it.
import type { StatusCard } from './mixitup-page';
import type { CommandCheckRow } from './mixitup-command-check-core';

export const CONNS = [
  { id: 'bridge', label: 'TCG Bridge' },
  { id: 'mixitup', label: 'Mix It Up' },
  { id: 'obs', label: 'OBS' },
  { id: 'twitch', label: 'Twitch channel' },
  { id: 'command', label: 'Command check' },
  { id: 'errors', label: 'Error reports' },
] as const;
export type ConnId = (typeof CONNS)[number]['id'];
export const pickConn = (raw: string | undefined): ConnId | null => CONNS.find(c => c.id === raw)?.id ?? null;
export const connHref = (id: ConnId): string => `/admin/stream?section=connections&conn=${id}`;

/** Old in-page anchors and the connection that holds them now (a `#fragment` never reaches the server, so links to them are written with the `conn`). */
export const ANCHOR_CONN: Record<string, ConnId> = { 'bridge-errors': 'errors' };
export const connForAnchor = (hash: string): ConnId | null => (Object.hasOwn(ANCHOR_CONN, hash.replace(/^#/, '')) ? ANCHOR_CONN[hash.replace(/^#/, '')] : null);

export type ConnTone = 'ok' | 'warn' | 'bad' | 'muted';
/** The text equivalent of a dot's colour. */
export const TONE_WORD: Record<ConnTone, string> = { ok: 'Good', warn: 'Needs a look', bad: 'Problem', muted: 'Not checked' };
export interface ConnItem { id: ConnId; label: string; tone: ConnTone; state: string }

export interface ConnInput {
  /** The three status cards (`statusCards`): Mix It Up to the site, the site to Mix It Up, OBS. */
  cards: StatusCard[];
  connection: 'bridge' | 'addresses';
  /** How many PCs are paired or signed in. */
  paired: number;
  /** The connected Twitch channel, or null. `listening` is TCG Bridge's EventSub line being live; `chat` is the chat permission. */
  twitch: { login: string; listening: boolean; chat: boolean } | null;
  commandCheck: CommandCheckRow[] | null;
  /** TCG Bridge error reports in the last 24 hours. */
  errors24h: number;
}

const card = (cards: StatusCard[], id: StatusCard['id']) => cards.find(c => c.id === id);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The list's six items, in order. The site-to-Mix-It-Up status folds into TCG Bridge (or into Mix It Up when direct addresses are used); Mix It Up to the site folds into Mix It Up. */
export function connectionList(i: ConnInput): ConnItem[] {
  const out = card(i.cards, 'outgoing'), inc = card(i.cards, 'incoming'), obs = card(i.cards, 'obs');
  const direct = i.connection === 'addresses';
  const pcs = i.paired === 0 ? { tone: 'bad' as const, state: 'No PC linked yet' } : { tone: 'ok' as const, state: `${plural(i.paired, 'PC')} linked` };
  const bridge: Pick<ConnItem, 'tone' | 'state'> = direct ? (i.paired === 0 ? { tone: 'muted', state: 'Not used, direct addresses' } : pcs)
    : i.paired > 0 && out && out.tone !== 'ok' ? { tone: out.tone, state: out.state } : pcs;
  const mix: Pick<ConnItem, 'tone' | 'state'> = direct && out ? { tone: out.tone, state: out.tone === 'ok' ? 'Direct addresses working' : out.state }
    : inc ? { tone: inc.tone, state: inc.state } : { tone: 'muted', state: 'Not checked' };
  const t = i.twitch;
  const twitch: Pick<ConnItem, 'tone' | 'state'> = !t ? { tone: 'muted', state: 'Not connected' }
    : !t.listening ? { tone: 'warn', state: 'TCG Bridge is not listening' }
    : !t.chat ? { tone: 'warn', state: 'Reconnect to allow chat' }
    : { tone: 'ok', state: 'Listening, chat on' };
  const missing = i.commandCheck?.filter(r => !r.found).length ?? 0;
  const command: Pick<ConnItem, 'tone' | 'state'> = !i.commandCheck ? { tone: 'muted', state: 'Not checked yet' }
    : missing ? { tone: 'warn', state: `${missing} missing` } : { tone: 'ok', state: `All ${i.commandCheck.length} found` };
  const errors: Pick<ConnItem, 'tone' | 'state'> = i.errors24h > 0 ? { tone: 'warn', state: `${i.errors24h} in 24 h` } : { tone: 'ok', state: 'None in 24 h' };
  const by: Record<ConnId, Pick<ConnItem, 'tone' | 'state'>> = { bridge, mixitup: mix, obs: obs ? { tone: obs.tone, state: obs.state } : { tone: 'muted', state: 'Not checked' }, twitch, command, errors };
  return CONNS.map(c => ({ id: c.id, label: c.label, ...by[c.id] }));
}

/** The connection to open when none is asked for: the first that needs attention, else TCG Bridge. */
export const defaultConn = (list: ConnItem[]): ConnId => list.find(c => c.tone === 'warn' || c.tone === 'bad')?.id ?? 'bridge';
