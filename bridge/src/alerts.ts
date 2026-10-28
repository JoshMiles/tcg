// When to tell the streamer that a link dropped or came back. Plain TypeScript, no Electron: it is fed what the app sees and the clock,
// and returns the notifications to show; main.ts only shows them.
import type { BridgeState } from './service';

export type Part = 'site' | 'mix' | 'obs' | 'twitch';
export interface Notice { part: Part; kind: 'drop' | 'back'; title: string; body: string }
/** What the app sees right now. `site` is null when the site revoked this PC (nothing to alert about) and `obs` when OBS is switched off in
 *  the app; `streaming` is OBS's own word, null when it says nothing. `twitch` (58.2) is null when there is nothing to listen to (no channel
 *  connected, or this PC may not listen) or when the field is absent. */
export interface Snapshot { site: boolean | null; mix: boolean; obs: boolean | null; streaming: boolean | null; twitch?: boolean | null }

export const DOWN_FOR_MS = 15_000; // a part is down only after this long, so one missed poll never alerts
export const REPEAT_MS = 120_000; // at most one drop alert per part in this time

const DROP: Record<Part, [string, string]> = {
  site: ['TCG Bridge lost the site', 'TCG Bridge cannot reach the site. Check this PC\'s internet connection.'],
  mix: ['Mix It Up stopped answering', 'Mix It Up stopped answering. Is it still running, with its Developer API on?'],
  obs: ['TCG Bridge lost OBS', 'OBS stopped answering. Is it still running, with its WebSocket server on?'],
  twitch: ['TCG Bridge lost Twitch events', 'TCG Bridge stopped hearing Twitch events (channel points, bits, gifted subs, raids). It keeps trying; see Connections if this lasts.'],
};
const NAME: Record<Part, string> = { site: 'The site link', mix: 'Mix It Up', obs: 'OBS', twitch: 'The Twitch event link' };

interface Track { wasUp: boolean; downSince: number | null; alerted: boolean; lastDropAt: number | null }

export function snapshotOf(s: BridgeState): Snapshot {
  const on = s.obs.enabled;
  const t = s.twitch;
  // Nothing connected on the site, or not allowed: nothing to alert about. Connected is up; anything else (reconnecting, no token, Twitch ended it) is down.
  const twitch = t.state === 'off' && (t.why === 'none' || t.why === 'forbidden') ? null : t.state === 'connected';
  return { site: s.site === 'revoked' ? null : s.site === 'connected', mix: s.mix.found, obs: on ? s.obs.connected : null, streaming: on ? s.obs.streaming : null, twitch };
}

export class Alerts {
  private parts: Record<Part, Track> = {
    site: { wasUp: false, downSince: null, alerted: false, lastDropAt: null },
    mix: { wasUp: false, downSince: null, alerted: false, lastDropAt: null },
    obs: { wasUp: false, downSince: null, alerted: false, lastDropAt: null },
    twitch: { wasUp: false, downSince: null, alerted: false, lastDropAt: null },
  };
  /** OBS's last word on streaming, kept while OBS is lost. */
  private lastStreaming: boolean | null = null;

  /** Call it on every change and on a timer (the 15 s is measured here). Returns the notifications to show now. */
  update(s: Snapshot, now: number): Notice[] {
    if (s.obs === null) this.lastStreaming = null; // no OBS, no live signal
    else if (s.streaming !== null) this.lastStreaming = s.streaming;
    const live = s.obs === null || this.lastStreaming === true; // without OBS there is no live signal, so every drop counts
    const out: Notice[] = [];
    for (const part of ['site', 'mix', 'obs', 'twitch'] as const) {
      const up = part === 'obs' ? s.obs : part === 'twitch' ? s.twitch ?? null : s[part];
      const t = this.parts[part];
      if (up === null) { // not tracked (OBS off): forget it
        Object.assign(t, { wasUp: false, downSince: null, alerted: false });
      } else if (up) {
        if (t.alerted) out.push({ part, kind: 'back', title: `${NAME[part]} is back`, body: `${NAME[part]} is working again.` });
        Object.assign(t, { wasUp: true, downSince: null, alerted: false });
      } else if (t.downSince === null && t.wasUp) {
        t.downSince = now;
      } else if (t.downSince !== null && !t.alerted && now - t.downSince >= DOWN_FOR_MS && live && (t.lastDropAt === null || now - t.lastDropAt >= REPEAT_MS)) {
        t.alerted = true;
        t.lastDropAt = now;
        out.push({ part, kind: 'drop', title: DROP[part][0], body: DROP[part][1] });
      }
    }
    return out;
  }
}
