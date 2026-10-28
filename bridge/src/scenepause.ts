// Pause pulls on chosen OBS scenes (ROADMAP 57.2). Plain TypeScript, no Electron. Off by default. The site keeps the rule that matters
// (lib/pull-pause.ts setScenePause): a scene only pauses what is open and only resumes a pause a scene made, so a pause set by hand is
// never lifted from here. This class decides what to tell the site: the scene name when a chosen scene is on air, else null.
export interface ScenePauseSettings { on: boolean; scenes: string[] }
export const defaultScenePause = (): ScenePauseSettings => ({ on: false, scenes: [] });

const SCENES_MAX = 100;

/** Settings read from disk or the window: a switch and up to 100 scene names. */
export function cleanScenePause(raw: unknown): ScenePauseSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { on?: unknown; scenes?: unknown };
  const scenes = Array.isArray(o.scenes) ? o.scenes.filter((s): s is string => typeof s === 'string' && s !== '' && s.length <= 200) : [];
  return { on: o.on === true, scenes: [...new Set(scenes)].slice(0, SCENES_MAX) };
}

export class ScenePause {
  private cfg: ScenePauseSettings = defaultScenePause();
  private connected = false;
  private scene = '';
  /** What the site last accepted: a scene name, null (open), or undefined (nothing sent since the app started or OBS connected). */
  private sent: string | null | undefined;
  private busy = false;
  private failed: { want: string | null } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `send` tells the site (scene name or null) and throws when it cannot be reached; it is tried again on the next change or after `retryMs`, never in a loop. */
  constructor(private send: (scene: string | null) => Promise<void>, private retryMs = 30_000) {}

  /** Called on every change of the settings or of OBS (cheap and safe to repeat). */
  update(cfg: ScenePauseSettings, connected: boolean, scene: string): void {
    if (connected && !this.connected) this.sent = undefined; // start-up and every reconnect apply the rule to the scene on air, once
    this.cfg = cfg;
    this.connected = connected;
    this.scene = scene;
    void this.apply();
  }

  stop(): void { clearTimeout(this.timer); this.timer = undefined; }

  private async apply(): Promise<void> {
    if (this.busy || !this.connected || !this.scene) return; // an unknown scene (OBS has not answered yet) changes nothing
    const want = this.cfg.on && this.cfg.scenes.includes(this.scene) ? this.scene : null;
    if (want === this.sent || (want === null && this.sent === undefined && !this.cfg.on)) return; // switched off and nothing to undo
    if (this.failed && this.failed.want === want) return; // the site could not be reached for this: the timer asks again, a different scene asks at once
    clearTimeout(this.timer);
    this.timer = undefined;
    this.busy = true;
    try {
      await this.send(want);
      this.sent = want;
      this.failed = null;
    } catch {
      this.failed = { want };
      this.timer = setTimeout(() => { this.failed = null; void this.apply(); }, this.retryMs);
      return;
    } finally {
      this.busy = false;
    }
    void this.apply(); // the scene may have changed while the site was asked
  }
}
