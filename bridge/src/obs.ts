// OBS through obs-websocket v5 (built into OBS 28 and later): is OBS streaming, which scene is on air, and is the TCG overlay
// browser source in that scene and visible. Plain TypeScript, no Electron: service.ts owns it, main.ts only gives it a config.
// It only ever connects to this PC (ws://localhost or ws://127.0.0.1) and only tells the site facts, never the overlay address or key.
import { EventSubscription, OBSWebSocket } from 'obs-websocket-js/json';
import { textInputNames } from './obsstats';

export const DEFAULT_OBS_ADDRESS = 'ws://127.0.0.1:4455';
export interface ObsConfig { enabled: boolean; address: string; password: string; /** Start the replay buffer when the stream starts (55.8). */ startReplay?: boolean }
export interface OverlayCheck { found: boolean; inProgram: boolean; visible: boolean; sourceName: string }
export interface ObsState { enabled: boolean; connected: boolean; error: string; scene: string; streaming: boolean | null; overlay: OverlayCheck }

/** A refresh (or another request) OBS could not do; the message is for the streamer. */
export class ObsError extends Error {}

/** ws://localhost:4455 or ws://127.0.0.1:4455 (a port is required), as typed or null. Nothing else is accepted. */
export function cleanObsAddress(raw: string): string | null {
  const m = /^ws:\/\/(localhost|127\.0\.0\.1):(\d{1,5})\/?$/.exec(raw.trim());
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 65535 ? `ws://${m[1]}:${Number(m[2])}` : null;
}

/** Is this browser source address the TCG overlay page of the paired site? (Same host, www ignored; the key and other parameters do not matter.) */
export function isOverlayUrl(raw: unknown, site: string): boolean {
  try {
    const u = new URL(String(raw));
    const bare = (h: string) => h.replace(/^www\./, '');
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.pathname === '/overlay.html' && bare(u.host) === bare(new URL(site).host);
  } catch { return false; }
}

const SUBSCRIPTIONS = EventSubscription.Scenes | EventSubscription.Inputs | EventSubscription.Outputs | EventSubscription.SceneItems;
const EVENTS = ['CurrentProgramSceneChanged', 'SceneItemEnableStateChanged', 'InputSettingsChanged', 'InputCreated', 'InputRemoved', 'InputNameChanged'] as const;
const NONE: OverlayCheck = { found: false, inProgram: false, visible: false, sourceName: '' };
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(done, ms);
  function done() { clearTimeout(t); signal.removeEventListener('abort', done); resolve(); }
  signal.addEventListener('abort', done);
});

function describe(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 4009 || /authenticat/i.test(e instanceof Error ? e.message : '')) return 'Wrong OBS WebSocket password';
  return 'OBS is not running, or its WebSocket server is switched off';
}

interface Item { sceneItemId: number; sourceName: string; sceneItemEnabled: boolean; isGroup: boolean | null }

const SCENES_MAX = 100;
const SOURCES_MAX = 200;
const REQUEST_MS = 4000;

export interface ObsOptions {
  /** The paired site's origin: only a browser source on this site's overlay page counts. */
  site: string;
  /** Posts to /api/bridge/report. Failures are ignored here: the site is told again on the next change or heartbeat. */
  report: (body: Record<string, unknown>) => Promise<unknown>;
  backoffMs?: { min: number; max: number };
  debounceMs?: number;
  /** At most one snapshot per this many ms. */
  reportMs?: number;
  /** An unchanged snapshot is sent again this often while connected, so the site can tell a quiet OBS from a lost one. */
  heartbeatMs?: number;
  /** How long after a reveal a clip is saved, so the reaction is in it (55.8). */
  clipAfterMs?: number;
}

export class ObsWatcher {
  readonly state: ObsState = { enabled: false, connected: false, error: '', scene: '', streaming: null, overlay: { ...NONE } };
  /** Set by the service so the tray level follows OBS. */
  onChange: () => void = () => undefined;
  /** Set by the service: a failure worth an error report (57.9). */
  onError: (part: 'obs' | 'reconnect', message: string) => void = () => undefined;
  private config: ObsConfig;
  private o: Required<ObsOptions>;
  private run: { abort: AbortController; done: Promise<void> } | null = null;
  private obs: OBSWebSocket | null = null;
  private checkTimer: ReturnType<typeof setTimeout> | undefined;
  private sendTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSent = 0;
  private lastJson = '';
  /** The scene and source names last read from OBS (and sent to the site): a job may only name one of these. */
  private scenes: string[] = [];
  private sources: string[] = [];
  /** The text inputs last read from OBS (57.4): a stat may only be written to one of these. */
  private texts: string[] = [];
  /** Puts things back later (the scene, a hidden source). */
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(opts: ObsOptions, config: ObsConfig) {
    this.o = { backoffMs: { min: 1000, max: 30_000 }, debounceMs: 1000, reportMs: 1000, heartbeatMs: 30_000, clipAfterMs: 5000, ...opts };
    this.config = config;
    this.state.enabled = config.enabled;
  }

  start(): void {
    if (this.run || !this.config.enabled) return;
    const abort = new AbortController();
    this.run = { abort, done: this.loop(abort.signal) };
  }

  /** New settings: drop the connection and, when OBS is on, connect again. */
  async configure(config: ObsConfig): Promise<void> {
    await this.stop();
    this.config = config;
    this.state.enabled = config.enabled;
    this.state.error = '';
    this.onChange();
    this.start();
  }

  async stop(): Promise<void> {
    const run = this.run;
    this.run = null;
    run?.abort.abort();
    this.obs?.disconnect().catch(() => undefined);
    await run?.done;
    clearTimeout(this.checkTimer);
    clearTimeout(this.sendTimer);
    this.sendTimer = undefined;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.state.connected || this.lastJson) { // the site hears that OBS is gone
      this.state.connected = false;
      this.state.streaming = null;
      this.state.scene = '';
      this.state.overlay = { ...NONE };
      if (this.lastJson) this.send(true);
    }
  }

  /** Presses "Refresh cache of current page" on every overlay browser source. Returns how many. Throws ObsError in words. */
  async refresh(): Promise<number> {
    if (!this.config.enabled) throw new ObsError('OBS is switched off in TCG Bridge');
    const obs = this.obs;
    if (!obs || !this.state.connected) throw new ObsError('TCG Bridge is not connected to OBS');
    let names: string[];
    try {
      // A request on a connection that just closed never answers, so give up after a few seconds instead of holding the job.
      names = await Promise.race([
        (async () => {
          const found = await this.overlaySources(obs);
          for (const inputName of found) await obs.call('PressInputPropertiesButton', { inputName, propertyName: 'refreshnocache' });
          return found;
        })(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);
    } catch {
      throw new ObsError('OBS did not accept the refresh');
    }
    if (!names.length) throw new ObsError('The overlay browser source was not found in OBS');
    return names.length;
  }

  private live(): OBSWebSocket {
    if (!this.config.enabled) throw new ObsError('OBS is switched off in TCG Bridge');
    if (!this.obs || !this.state.connected) throw new ObsError('TCG Bridge is not connected to OBS');
    return this.obs;
  }

  private async ask<T>(f: () => Promise<T>, failed: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([f(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), REQUEST_MS); })]);
    } catch (e) {
      if (e instanceof ObsError) throw e;
      throw new ObsError(failed);
    } finally {
      clearTimeout(timer);
    }
  }

  private later(ms: number, f: () => Promise<unknown>): void {
    const t = setTimeout(() => { this.timers.delete(t); void f().catch(() => undefined); }, ms);
    this.timers.add(t);
  }

  /** Saves the replay buffer `clipAfterMs` from now (after the reveal). Says plainly when the buffer is off. */
  async saveClip(): Promise<void> {
    const obs = this.live();
    const on = await this.ask(async () => (await obs.call('GetReplayBufferStatus')).outputActive, 'OBS did not answer about the replay buffer').catch(() => { throw new ObsError('The OBS replay buffer is off, so no clip was saved'); });
    if (!on) throw new ObsError('The OBS replay buffer is off, so no clip was saved');
    this.later(this.o.clipAfterMs, () => obs.call('SaveReplayBuffer'));
  }

  /** Cuts to a scene OBS reported, then back to the one that was on air after `secs`. */
  async switchScene(name: string, secs: number): Promise<void> {
    const obs = this.live();
    if (!this.scenes.includes(name)) throw new ObsError(`OBS has no scene called ${name}`);
    const back = this.state.scene;
    await this.ask(() => obs.call('SetCurrentProgramScene', { sceneName: name }), 'OBS did not switch the scene');
    // Only go back when nobody changed scene meanwhile.
    this.later(secs * 1000, async () => { if (this.state.scene === name && back && back !== name) await obs.call('SetCurrentProgramScene', { sceneName: back }); });
  }

  /** The scene names last read from OBS (the Staff tab's scene list, ROADMAP 55.12). */
  sceneNames(): string[] { return [...this.scenes]; }

  /** The GDI+ / FreeType text inputs last read from OBS (the Settings tab's stat list, ROADMAP 57.4). */
  textSources(): string[] { return [...this.texts]; }

  /** Sets the `text` of a text input OBS reported, and nothing else about it. */
  async setText(name: string, text: string): Promise<void> {
    const obs = this.live();
    if (!this.texts.includes(name)) throw new ObsError(`OBS has no text source called ${name}`);
    await this.ask(() => obs.call('SetInputSettings', { inputName: name, inputSettings: { text } }), 'OBS did not accept the text');
  }

  /** Cuts to a scene OBS reported and stays there (the Staff tab); `switchScene` goes back by itself. */
  async setScene(name: string): Promise<void> {
    const obs = this.live();
    if (!this.scenes.includes(name)) throw new ObsError(`OBS has no scene called ${name}`);
    await this.ask(() => obs.call('SetCurrentProgramScene', { sceneName: name }), 'OBS did not switch the scene');
  }

  /** Shows a source of the scene on air, and hides it again after `holdMs` (0 leaves it shown). */
  async showSource(name: string, holdMs: number): Promise<void> {
    const obs = this.live();
    if (!this.sources.includes(name)) throw new ObsError(`OBS has no source called ${name} in the current scene`);
    const sceneName = this.state.scene;
    const set = (sceneItemEnabled: boolean) => obs.call('GetSceneItemId', { sceneName, sourceName: name }).then(r => obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: r.sceneItemId, sceneItemEnabled }));
    await this.ask(() => set(true), 'OBS did not show the source');
    if (holdMs > 0) this.later(holdMs, () => set(false));
  }

  /** Runs the overlay check now (the window's "Check OBS") and returns what it found. Throws ObsError in words. */
  async checkNow(): Promise<ObsState> {
    if (!this.config.enabled) throw new ObsError('OBS is switched off in TCG Bridge');
    if (!this.obs || !this.state.connected) throw new ObsError(`TCG Bridge is not connected to OBS${this.state.error ? ` (${this.state.error})` : ''}`);
    clearTimeout(this.checkTimer);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.check(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 4000); })]);
    } catch {
      throw new ObsError('OBS did not answer the check');
    } finally {
      clearTimeout(timer);
    }
    if (!this.state.connected) throw new ObsError('Lost the connection to OBS');
    if (this.state.error) throw new ObsError(this.state.error);
    this.queueSend();
    return this.state;
  }

  // ── The connection loop ──

  private async loop(signal: AbortSignal): Promise<void> {
    let backoff = this.o.backoffMs.min;
    while (!signal.aborted) {
      const obs = new OBSWebSocket();
      const address = cleanObsAddress(this.config.address);
      try {
        if (!address) throw new ObsError('The OBS address must be ws://localhost:4455 or ws://127.0.0.1:4455');
        await obs.connect(address, this.config.password || undefined, { rpcVersion: 1, eventSubscriptions: SUBSCRIPTIONS });
      } catch (e) {
        obs.disconnect().catch(() => undefined);
        if (signal.aborted) return;
        this.setDown(e instanceof ObsError ? e.message : describe(e));
        if (backoff * 2 >= this.o.backoffMs.max && backoff < this.o.backoffMs.max) this.onError('reconnect', `OBS still cannot be reached after several tries: ${this.state.error}`); // once per outage: the wait has reached its longest
        await sleep(backoff, signal);
        backoff = Math.min(backoff * 2, this.o.backoffMs.max);
        continue;
      }
      if (signal.aborted) { obs.disconnect().catch(() => undefined); return; }
      backoff = this.o.backoffMs.min;
      const closed = new Promise<void>(resolve => { obs.once('ConnectionClosed', () => resolve()); });
      const stopped = new Promise<void>(resolve => { signal.addEventListener('abort', () => resolve()); });
      this.obs = obs;
      obs.on('StreamStateChanged', e => {
        if (e.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') this.streamChanged(true);
        else if (e.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') this.streamChanged(false);
      });
      // Our own stat writes change a text input once a second: that must not start a re-read of OBS each time (57.4).
      for (const name of EVENTS) obs.on(name, (e: unknown) => { if (name !== 'InputSettingsChanged' || !this.texts.includes(String((e as { inputName?: unknown } | null)?.inputName))) this.recheck(); });
      const heartbeat = setInterval(() => this.send(true), this.o.heartbeatMs);
      this.state.connected = true;
      this.state.error = '';
      this.lastJson = '';
      // In the background: a request on a connection that closes never answers, so only `closed` ends this session.
      void (async () => {
        this.streamChanged((await obs.call('GetStreamStatus')).outputActive);        await this.check();
        this.send(true);
      })().catch(() => { this.state.error = 'Could not read OBS'; this.onError('obs', 'Could not read OBS'); this.onChange(); });
      await Promise.race([closed, stopped]);
      clearInterval(heartbeat);
      this.obs = null;
      obs.removeAllListeners();
      obs.disconnect().catch(() => undefined);
      if (signal.aborted) return;
      this.setDown('Lost the connection to OBS');
      await sleep(backoff, signal);
    }
  }

  private setDown(error: string): void {
    const was = this.state.connected;
    this.state.connected = false;
    this.state.error = error;
    this.state.streaming = null;
    this.state.scene = '';
    this.state.overlay = { ...NONE };
    this.onChange();
    if (was || !this.lastJson) this.queueSend(); // the first time too: the site learns OBS is switched on but not reachable
  }

  /** The "start the replay buffer with the stream" switch. A buffer that is already running or cannot start is left alone. */
  private async startReplayBuffer(obs: OBSWebSocket): Promise<void> {
    if (!this.config.startReplay) return;
    try {
      if (!(await obs.call('GetReplayBufferStatus')).outputActive) await obs.call('StartReplayBuffer');
    } catch { /* the clip action says so when the buffer is off */ }
  }

  private streamChanged(live: boolean): void {
    if (live && this.obs) void this.startReplayBuffer(this.obs);
    this.state.streaming = live;
    this.onChange();
    void this.o.report({ type: 'stream', live }).catch(() => undefined);
  }

  // ── The overlay check ──

  private recheck(): void {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => { void this.check().then(() => this.queueSend(), () => undefined); }, this.o.debounceMs);
  }

  private async overlaySources(obs: OBSWebSocket): Promise<string[]> {
    const list = await obs.call('GetInputList', { inputKind: 'browser_source' });
    const names: string[] = [];
    for (const input of list.inputs as { inputName?: string }[]) {
      if (typeof input.inputName !== 'string') continue;
      const s = await obs.call('GetInputSettings', { inputName: input.inputName });
      if (isOverlayUrl((s.inputSettings as { url?: unknown }).url, this.o.site)) names.push(input.inputName);
    }
    return names;
  }

  /** Reads OBS again: the program scene and where the overlay sources are. Groups are looked into one level; nested scenes are not. */
  private async check(): Promise<void> {
    const obs = this.obs;
    if (!obs) return;
    try {
      const cur = (await obs.call('GetCurrentProgramScene')) as { currentProgramSceneName?: string; sceneName?: string };
      const scene = cur.currentProgramSceneName ?? cur.sceneName ?? '';
      const names = await this.overlaySources(obs);
      const overlay: OverlayCheck = { found: names.length > 0, inProgram: false, visible: false, sourceName: names[0] ?? '' };
      // The names a pull rule may pick (55.8): every scene, and the items of the scene on air.
      // Best effort: a failure here must not hide the overlay check.
      const list = (await obs.call('GetSceneList').catch(() => ({ scenes: [] }))) as unknown as { scenes?: { sceneName?: string }[] };
      this.scenes = (list.scenes ?? []).map(s => s.sceneName).filter((n): n is string => typeof n === 'string').slice(0, SCENES_MAX);
      const inputs = (await obs.call('GetInputList').catch(() => ({ inputs: [] }))) as unknown as { inputs?: { inputName?: unknown; inputKind?: unknown }[] };
      this.texts = textInputNames(inputs.inputs ?? []).slice(0, SOURCES_MAX);
      const items = (await obs.call('GetSceneItemList', { sceneName: scene }).catch(() => ({ sceneItems: [] }))).sceneItems as unknown as Item[];
      this.sources = items.map(i => i.sourceName).filter(n => !names.includes(n)).slice(0, SOURCES_MAX);
      if (names.length) {
        const best = (name: string, visible: boolean) => {
          if (!overlay.inProgram || (visible && !overlay.visible)) overlay.sourceName = name;
          overlay.inProgram = true;
          overlay.visible = overlay.visible || visible;
        };
        const top = (await obs.call('GetSceneItemList', { sceneName: scene })).sceneItems as unknown as Item[];
        for (const it of top) {
          if (names.includes(it.sourceName)) best(it.sourceName, it.sceneItemEnabled);
          else if (it.isGroup) {
            const inside = (await obs.call('GetGroupSceneItemList', { sceneName: it.sourceName })).sceneItems as unknown as Item[];
            for (const g of inside) if (names.includes(g.sourceName)) best(g.sourceName, it.sceneItemEnabled && g.sceneItemEnabled);
          }
        }
      }
      this.state.scene = scene;
      this.state.overlay = overlay;
      this.state.error = '';
    } catch (e) {
      if (!this.obs) return; // gone while reading: the loop reports it
      this.state.error = `Could not read OBS${e instanceof Error && e.message ? `: ${e.message}` : ''}`;
    }
    this.onChange();
  }

  // ── Telling the site ──

  private queueSend(): void {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => { this.sendTimer = undefined; this.send(false); }, Math.max(0, this.lastSent + this.o.reportMs - Date.now()));
  }

  /** `force` sends even an unchanged snapshot (a heartbeat). */
  private send(force: boolean): void {
    const { connected, scene, overlay } = this.state;
    const body = { type: 'obs', connected, scene, overlay: { found: overlay.found, inProgram: overlay.inProgram, visible: overlay.visible, sourceName: overlay.sourceName }, scenes: connected ? this.scenes : [], sources: connected ? this.sources : [] };
    const json = JSON.stringify(body);
    if (!force && json === this.lastJson) return;
    this.lastJson = json;
    this.lastSent = Date.now();
    void this.o.report(body).catch(() => undefined);
  }
}
