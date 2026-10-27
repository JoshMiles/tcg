// What TCG Bridge's Stream Deck buttons, hotkeys, tray menu and queue panel ask the site to do (ROADMAP 55.9). POST /api/bridge/action
// (bearer token, bridgeGuard) calls runBridgeAction; the action names are fixed. Each answers { ok, message } and `status` also
// answers { paused, buffs }. A buff goes through runStreamDeck (lib/streamdeck.ts), so its switch, cooldown and audit line are the same.
import { kv } from './db';
import { recordAudit } from './audit';
import { bridgeQueue } from './bridge';
import { getBuffDef, getBuffDefs } from './buffs';
import { isPullsPaused, setPullsPaused } from './pull-pause';
import { clearQueueRefunding, skipNext } from './queue-control';
import { LAST_BUFF, runStreamDeck } from './streamdeck';

const BY = 'TCG Bridge';
export interface BridgeActionResult { ok: boolean; message: string; paused?: boolean; buffs?: { id: string; name: string }[] }
const done = (ok: boolean, message: string, extra: Partial<BridgeActionResult> = {}): BridgeActionResult => ({ ok, message, ...extra });
const words = async (r: Promise<{ ok: boolean; message: string }>) => { const x = await r; return done(x.ok, x.message || 'That buff is not switched on for the Stream Deck.'); };

export async function runBridgeAction(body: Record<string, unknown>): Promise<BridgeActionResult> {
  switch (body.action) {
    case 'status': {
      const buffs = (await getBuffDefs()).filter(b => b.streamDeck && b.type !== 'grant-achievement').map(b => ({ id: b.id, name: b.name }));
      return done(true, '', { paused: await isPullsPaused(), buffs });
    }
    case 'buff': {
      const def = typeof body.id === 'string' ? await getBuffDef(body.id) : null;
      if (!def) return done(false, 'That buff does not exist.');
      return words(runStreamDeck({ buff: def.id, target: def.scope === 'community' ? 'everyone' : 'last-pull' }));
    }
    case 'last-buff': {
      const last = await kv.get<Record<string, unknown>>(LAST_BUFF);
      return last ? words(runStreamDeck(last)) : done(false, 'No buff has been pressed yet.');
    }
    case 'pause': {
      const on = typeof body.on === 'boolean' ? body.on : !(await isPullsPaused());
      if (await setPullsPaused(on)) await recordAudit('everyone', `${BY}: pulls ${on ? 'paused' : 'resumed'}`);
      return done(true, on ? 'Pulls are paused.' : 'Pulls are open.', { paused: on });
    }
    case 'refresh':
      return (await bridgeQueue({ kind: 'obs-refresh' })) ? done(true, 'Refreshing the overlay in OBS.') : done(false, 'The overlay could not be refreshed.');
    case 'skip': {
      const e = await skipNext();
      if (e) await recordAudit(e.username, `${BY}: skipped the next ${e.type === 'pull' ? 'pull' : 'show-off'}`);
      return done(!!e, e ? `Skipped ${e.username}'s ${e.type === 'pull' ? 'pull' : 'show-off'}.` : 'The queue is empty.');
    }
    case 'clear-queue': {
      const n = await clearQueueRefunding();
      if (n > 0) await recordAudit('everyone', `${BY}: cleared ${n} waiting event${n === 1 ? '' : 's'}`);
      return done(true, n > 0 ? `Cleared ${n} waiting event${n === 1 ? '' : 's'}.` : 'The queue was already empty.');
    }
    default:
      return done(false, 'Unknown action.');
  }
}
