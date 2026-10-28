// The Connections page (ROADMAP 59.6): the list on the left (one row per connection) and what the detail on the right says first.
// Plain TypeScript, no Electron. The window shows these strings with textContent only.
// A Twitch channel row (58.1) joins CONN_ORDER and rowFor() later. The account row says "Signed in with Twitch as <login> (<role>)" for a linked PC (58.0b).
import { accountLabel } from './signin';

export type ConnId = 'account' | 'mix' | 'obs' | 'deck';
export const CONN_ORDER: ConnId[] = ['account', 'mix', 'obs', 'deck'];
/** green, amber, red or grey (not used); the window maps it to the dot's class. */
export type ConnTone = 'ok' | 'warn' | 'bad' | 'off';

export interface ConnFacts {
  paired: boolean;
  pairedAs: string;
  /** Signed in with Twitch (58.0b): the login and role of a linked PC; '' or absent = paired with a code. */
  login?: string;
  role?: string;
  /** null = the service is not running yet. */
  site: 'connecting' | 'connected' | 'offline' | 'revoked' | null;
  siteError: string;
  mixFound: boolean;
  obsEnabled: boolean;
  obsConnected: boolean;
  obsStreaming: boolean | null;
  obsError: string;
  deckInstalled: boolean;
  deckOn: boolean;
  deckConnected: boolean;
  deckError: string;
  /** A plugin has connected since the app started. */
  deckSeen: boolean;
}

/** Why the plugin is not linked, in words ('' = it is linked, or nothing is installed to link). */
export function deckReason(f: Pick<ConnFacts, 'deckInstalled' | 'deckOn' | 'deckConnected' | 'deckError' | 'deckSeen'>): string {
  if (!f.deckInstalled || (f.deckOn && f.deckConnected && !f.deckError)) return '';
  if (f.deckError) return `TCG Bridge is not listening for the plugin. ${f.deckError}`;
  if (!f.deckOn) return 'The link to the plugin is switched off, so the plugin cannot reach TCG Bridge.';
  return f.deckSeen ? 'The plugin was connected and has gone. The Stream Deck app may have been closed.' : 'TCG Bridge is listening, but the plugin has not connected since it started. The Stream Deck app may be closed, or the plugin did not start.';
}

export interface ConnRow {
  id: ConnId;
  name: string;
  tone: ConnTone;
  /** One line in the list. */
  line: string;
  /** The detail's header, a sentence. */
  sentence: string;
}

export interface FixPlan {
  /** Numbered steps shown at the top of the detail; empty = nothing to fix. */
  steps: string[];
  /** Whether the steps end with a "Check again" button (Mix It Up and OBS have a check to run). */
  again: boolean;
}

export const CONN_NAMES: Record<ConnId, string> = { account: 'TCG account', mix: 'Mix It Up', obs: 'OBS', deck: 'Stream Deck plugin' };

export function rowFor(id: ConnId, f: ConnFacts): ConnRow {
  const name = CONN_NAMES[id];
  const row = (tone: ConnTone, line: string, sentence: string): ConnRow => ({ id, name, tone, line, sentence });
  if (id === 'account') {
    if (!f.paired || f.site === 'revoked') return row('bad', 'Not paired', 'This PC is not paired with the site');
    const label = accountLabel({ login: f.login ?? '', role: f.role ?? '', pairedAs: f.pairedAs });
    const as = f.login ? label.replace('Signed in with Twitch as', 'Signed in as') : label; // the list is narrow: the detail says "with Twitch"
    if (f.site === 'offline') return row('bad', 'Cannot reach the site', 'The site cannot be reached');
    if (f.site === 'connected') return row('ok', as, f.login ? label : `Paired with the site as ${f.pairedAs}`);
    return row('warn', `${as}, connecting`, 'Connecting to the site');
  }
  if (id === 'mix') {
    return f.mixFound ? row('ok', 'Connected', 'Mix It Up is connected') : row('bad', 'Not answering', 'Mix It Up is not answering');
  }
  if (id === 'obs') {
    if (!f.obsEnabled) return row('off', 'Off', 'OBS is off');
    if (f.obsConnected) return row('ok', f.obsStreaming ? 'Connected, the stream is live' : 'Connected', 'OBS is connected');
    return row('bad', 'Not connected', 'OBS is not connected');
  }
  if (f.deckError) return row('bad', 'Needs attention', 'The Stream Deck link has a problem');
  if (!f.deckOn) return row(f.deckInstalled ? 'warn' : 'off', 'Off', f.deckInstalled ? 'The Stream Deck plugin is installed but not linked: the link is switched off' : 'The Stream Deck plugin is off');
  if (f.deckConnected) return row('ok', 'Plugin connected', 'The Stream Deck plugin is connected');
  return row('warn', f.deckInstalled ? 'Waiting for the plugin' : 'Plugin not installed', f.deckInstalled ? 'The Stream Deck plugin is installed but not linked: it has not connected' : 'The Stream Deck plugin is not installed');
}

/** What the window gets: every row with its fix plan. */
export const connectionRows = (f: ConnFacts): (ConnRow & { fix: FixPlan })[] => CONN_ORDER.map(id => ({ ...rowFor(id, f), fix: fixPlan(id, f) }));

/** The fix steps of a connection that needs fixing, else none. */
export function fixPlan(id: ConnId, f: ConnFacts): FixPlan {
  if (id === 'account') {
    return f.paired && f.site === 'offline'
      ? { steps: ['Check that this PC is online.', 'TCG Bridge keeps trying by itself; this page updates when the site answers.'], again: false }
      : { steps: [], again: false };
  }
  if (id === 'mix') {
    return f.mixFound ? { steps: [], again: false } : {
      steps: ['Open Mix It Up (Start Mix It Up below opens it).', 'Go to Services > Developer API.', 'Press Connect. TCG Bridge notices within a few seconds.'],
      again: true,
    };
  }
  if (id === 'obs') {
    return f.obsEnabled && !f.obsConnected ? {
      steps: ['Open OBS (28 or newer).', 'Go to Tools > WebSocket Server Settings and tick Enable WebSocket server.', 'Copy the Server Password into Password below, check the address and press Save.'],
      again: true,
    } : { steps: [], again: false };
  }
  if (f.deckOn && !f.deckConnected && !f.deckError) {
    if (!f.deckInstalled) return { steps: ['Press Install Stream Deck plugin below, then open the Stream Deck app.'], again: false };
    const open = 'Open the Stream Deck app; the plugin connects by itself.';
    return { steps: f.deckSeen ? [open] : [open, 'Still not connected? Quit the Stream Deck app from its tray icon and open it again, or press Reinstall Stream Deck plugin below.'], again: false };
  }
  if (!f.deckOn && f.deckInstalled) return { steps: ['Turn on "Link to the Stream Deck plugin" below.'], again: false };
  return { steps: [], again: false };
}

/** The ids a status pill item or a Home chip can go to. 'connect' is the first-run Connect screen. */
export const GO_CONNECT = 'connect';
export const goFor = (id: ConnId): string => `conn-${id}`;
/** "conn-obs" to 'obs'; null for anything that is not a connection. */
export const connOf = (go: string): ConnId | null => (CONN_ORDER.find(id => goFor(id) === go) ?? null);
