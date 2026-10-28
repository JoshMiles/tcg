// What TCG Bridge's Stream Deck buttons, hotkeys, tray menu and queue panel ask the site to do (ROADMAP 55.9). POST /api/bridge/action
// (bearer token, bridgeGuard) calls runBridgeAction; the action names are fixed. Each answers { ok, message } and `status` also
// answers { paused, buffs }. A buff goes through runStreamDeck (lib/streamdeck.ts), so its switch, cooldown and audit line are the same.
import { kv } from './db';
import { recordAudit } from './audit';
import { bridgeQueue, type BridgeToken } from './bridge';
import { getTradeSettings } from './trades';
import { getBuffDef, getBuffDefs } from './buffs';
import { cleanWanted, readBridgeStats, type BridgeStats } from './bridge-stats';
import { isPullsPaused, pauseReason, setPullsPaused, setScenePause } from './pull-pause';
import { clearQueueRefunding, skipNext } from './queue-control';
import { endHappyHour, getHappyHour, happyHourWhat, startHappyHour } from './happyhour';
import type { HappyHour } from './mixitup-core';
import { getEventFeed, type MixItUpEvent } from './mixitup';
import { LAST_BUFF, runStreamDeck } from './streamdeck';
import { readCommandCheck } from './mixitup-command-check';
import { missingLabels } from './mixitup-command-check-core';

const BY = 'TCG Bridge';
export interface BridgeActionResult { ok: boolean; message: string; paused?: boolean; /** Why pulls are paused: "scene <name>", or '' for a pause set by hand (57.2). */ reason?: string; buffs?: { id: string; name: string }[]; /** ROADMAP 55.12: this PC's staff switch, and (with it) whether trading is paused. */ staff?: boolean; tradingPaused?: boolean; /** ROADMAP 57.3: the running happy hour (null = none); sent by `status`, `happy-hour-start` and `happy-hour-end`. */ happyHour?: { what: string; endsAt: number } | null; /** ROADMAP 57.4: the answer to `stats`. */ stats?: BridgeStats; /** ROADMAP 57.7: the answer to `events`, newest first. */ events?: MixItUpEvent[]; /** ROADMAP 57.8: sent by `status` once the app has reported its commands: the Mix It Up commands the site expects and does not find (empty = all found). */ commandsMissing?: string[] }
const hhFacts = (h: HappyHour | null) => (h ? { what: happyHourWhat(h), endsAt: h.endsAt } : null);
const done = (ok: boolean, message: string, extra: Partial<BridgeActionResult> = {}): BridgeActionResult => ({ ok, message, ...extra });
const words = async (r: Promise<{ ok: boolean; message: string }>) => { const x = await r; return done(x.ok, x.message || 'That buff is not switched on for the Stream Deck.'); };

export async function runBridgeAction(body: Record<string, unknown>, pc?: BridgeToken): Promise<BridgeActionResult> {
  switch (body.action) {
    case 'status': {
      const defs = await getBuffDefs();
      const buffs = defs.filter(b => b.streamDeck && b.type !== 'grant-achievement').map(b => ({ id: b.id, name: b.name }));
      const check = await readCommandCheck(defs);
      return done(true, '', { paused: await isPullsPaused(), reason: await pauseReason(), buffs, ...(check ? { commandsMissing: missingLabels(check) } : {}), staff: !!pc?.staff, happyHour: hhFacts(await getHappyHour()), ...(pc?.staff ? { tradingPaused: !(await getTradeSettings()).enabled } : {}) });
    }
    case 'stats': // ROADMAP 57.4: only the stats the app has mapped to an OBS text source (`stats`: a list of keys), plus the happy hour it counts down
      return done(true, '', { happyHour: hhFacts(await getHappyHour()), stats: await readBridgeStats(cleanWanted(body.stats)) });
    case 'events': // ROADMAP 57.7: the last event rewards (the Mix It Up log's event lines), only those after `after` (ms)
      return done(true, '', { events: await getEventFeed(typeof body.after === 'number' && body.after > 0 ? body.after : 0) });
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
      return done(true, on ? 'Pulls are paused.' : 'Pulls are open.', { paused: on, reason: await pauseReason() });
    }
    case 'scene-pause': { // ROADMAP 57.2: `scene` is the OBS scene on air when it is one the streamer picked, else null
      const scene = typeof body.scene === 'string' && body.scene.trim() ? body.scene.trim().slice(0, 100) : null;
      if (await setScenePause(scene)) await recordAudit('everyone', `${BY}: pulls ${scene ? `paused (scene ${scene})` : 'resumed (left the scene)'}`);
      const paused = await isPullsPaused();
      return done(true, paused ? 'Pulls are paused.' : 'Pulls are open.', { paused, reason: await pauseReason() });
    }
    case 'happy-hour-start': { // ROADMAP 57.3: the page's own functions, so validation, replacing, audit and the Discord log are the same
      const r = await startHappyHour({ minutes: body.minutes, kind: body.kind, percent: body.percent }, BY);
      return done(r.ok, r.message, { happyHour: r.ok ? hhFacts(r.happyHour) : hhFacts(await getHappyHour()) });
    }
    case 'happy-hour-end': {
      const r = await endHappyHour(BY);
      return done(true, r.message, { happyHour: null });
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
