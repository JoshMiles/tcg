// The status pill in the title bar (ROADMAP 59.3): what needs the streamer, as a short list. Plain TypeScript, no Electron.
// The window draws each item as a row with one button; `fix` says what the button does.
import { GO_CONNECT, goFor } from './connections';

export interface AttentionItem {
  id: 'update' | 'check' | 'pair' | 'site' | 'mix' | 'obs' | 'deck';
  text: string;
  detail: string;
  button: string;
  fix: 'restart' | 'recheck' | 'goto';
  go?: string; // where the fix is: 'conn-<id>' selects that connection on the Connections page, 'connect' is the Connect screen (src/connections.ts)
}

export interface AttentionFacts {
  paired: boolean;
  updateVersion: string; // '' = no update waiting
  startNote: string; // '' = the start-up update check was fine
  /** null = the service is not running yet: nothing is said about the links until it is. */
  site: 'connecting' | 'connected' | 'offline' | 'revoked' | null;
  mixFound: boolean;
  obsEnabled: boolean;
  obsConnected: boolean;
  /** Why an installed Stream Deck plugin is not linked (deckReason in connections.ts); '' = it is linked, not installed, or the app has only just started. */
  deckReason: string;
}

export function attentionItems(f: AttentionFacts): AttentionItem[] {
  const out: AttentionItem[] = [];
  if (f.updateVersion) out.push({ id: 'update', text: `Update ${f.updateVersion} is ready`, detail: 'Restart TCG Bridge to install it.', button: 'Restart', fix: 'restart' });
  if (f.startNote) out.push({ id: 'check', text: f.startNote, detail: 'The update check at start-up did not finish.', button: 'Try again', fix: 'recheck' });
  if (!f.paired) {
    out.push({ id: 'pair', text: 'Not paired with the site', detail: 'Pair this PC so the site can reach Mix It Up.', button: 'Fix', fix: 'goto', go: GO_CONNECT });
    return out;
  }
  if (f.site === 'revoked') out.push({ id: 'site', text: 'The site no longer accepts this PC', detail: 'Unpair, then pair again with a new code.', button: 'Fix', fix: 'goto', go: goFor('account') });
  else if (f.site === 'offline') out.push({ id: 'site', text: 'Cannot reach the site', detail: 'TCG Bridge keeps trying.', button: 'Fix', fix: 'goto', go: goFor('account') });
  if (f.site && !f.mixFound) out.push({ id: 'mix', text: 'Mix It Up is not connected', detail: 'Mix It Up is closed, or its Developer API is off.', button: 'Fix', fix: 'goto', go: goFor('mix') });
  if (f.site && f.obsEnabled && !f.obsConnected) out.push({ id: 'obs', text: 'OBS is not connected', detail: 'OBS is closed, or its WebSocket server is off.', button: 'Fix', fix: 'goto', go: goFor('obs') });
  if (f.deckReason) out.push({ id: 'deck', text: 'Stream Deck plugin installed but not linked', detail: f.deckReason, button: 'Fix', fix: 'goto', go: goFor('deck') });
  return out;
}
