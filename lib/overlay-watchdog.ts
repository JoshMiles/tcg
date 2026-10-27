// The overlay watchdog (ROADMAP 55.8). While the stream is live, if no overlay has pinged for 30 s but TCG Bridge sees the overlay source
// visible in OBS, the site asks the bridge to refresh it. At most once every 5 minutes. It runs from the bridge's OBS report
// (app/api/bridge/report), which already arrives every 30 s while a bridge is connected, so it needs no cron of its own; when its
// switch on the Mix It Up page is off it costs one settings read per report.
import { kv } from './db';
import { bridgeQueue } from './bridge';
import type { ObsSnapshot } from './bridge-core';
import { getMixItUpSettings, logMixItUp } from './mixitup';
import { getOverlayStatus } from './overlay';
import { getLiveStatus } from './twitch-live';

export const WATCHDOG_QUIET_MS = 30_000;
export const WATCHDOG_EVERY_S = 300;
const AT = 'mixitup:watchdog';
const LOCK = 'mixitup:watchdog:lock';

/** When the watchdog last refreshed the overlay, or null. */
export async function readWatchdogAt(): Promise<number | null> {
  const at = Number(await kv.get(AT).catch(() => null));
  return Number.isFinite(at) && at > 0 ? at : null;
}

/** Refreshes the overlay in OBS when it has gone quiet (see above). Never throws. True when a refresh was queued. */
export async function overlayWatchdog(obs: Pick<ObsSnapshot, 'connected' | 'overlay'>, now = Date.now()): Promise<boolean> {
  try {
    const o = obs.overlay;
    if (!obs.connected || !o.found || !o.inProgram || !o.visible) return false;
    if (!(await getMixItUpSettings()).overlayWatchdog) return false;
    const seen = (await getOverlayStatus()).lastSeen;
    if (seen !== null && now - seen <= WATCHDOG_QUIET_MS) return false;
    if (!(await getLiveStatus())?.live) return false;
    if (!(await kv.set(LOCK, now, { nx: true, ex: WATCHDOG_EVERY_S }))) return false; // the lock is the once-per-5-minutes rule
    const queued = await bridgeQueue({ kind: 'obs-refresh' });
    if (queued) await kv.set(AT, now);
    await logMixItUp({ username: 'overlay', what: 'watchdog', ok: queued, detail: queued ? `The overlay was quiet${seen ? ` for ${Math.round((now - seen) / 1000)} s` : ''}: asked TCG Bridge to refresh it in OBS` : 'The overlay was quiet but no refresh could be queued' });
    return queued;
  } catch {
    return false;
  }
}
