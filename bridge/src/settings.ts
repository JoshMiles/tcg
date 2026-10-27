// What the app remembers between runs. The token is encrypted by whatever `Cipher` the caller gives (Electron's safeStorage in main.ts).
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { HOTKEYS, noHotkeys, type HotkeyMap } from './control';
import { cleanFeedSettings, defaultFeed, type FeedSettings } from './feed';

export interface Settings {
  site: string; token: string; pairedAs: string; startWithWindows: boolean; obsEnabled: boolean; obsAddress: string; obsPassword: string; obsStartReplay: boolean;
  alerts: boolean; startMixItUp: boolean; mixItUpPath: string; lastSeenVersion: string;
  /** Random per install: it is in the path of every Stream Deck button, so a web page cannot guess one. Made on first run (main.ts). */
  controlKey: string; hotkeys: HotkeyMap;
  /** The streamer tools (ROADMAP 55.11), all off until switched on: the live pull feed window, the end of stream summary and starting OBS with the app. */
  feed: FeedSettings; summary: boolean; startObs: boolean; obsPath: string;
}
export const DEFAULT_SITE = 'https://cheesytcg.app';
export const defaults = (): Settings => ({ site: DEFAULT_SITE, token: '', pairedAs: '', startWithWindows: true, obsEnabled: false, obsAddress: 'ws://127.0.0.1:4455', obsPassword: '', obsStartReplay: false, alerts: true, startMixItUp: false, mixItUpPath: '', lastSeenVersion: '', controlKey: '', hotkeys: noHotkeys(), feed: defaultFeed(), summary: false, startObs: false, obsPath: '' });

export interface Cipher { encrypt(plain: string): Promise<Buffer>; decrypt(data: Buffer): Promise<string> }
export interface SettingsStore { load(): Promise<Settings>; save(s: Settings): Promise<void> }

/** settings.json in `dir`; the token and the OBS password are stored as base64 of the encrypted bytes, never in plain text. */
export class FileSettingsStore implements SettingsStore {
  private file: string;
  constructor(dir: string, private cipher: Cipher) { this.file = join(dir, 'settings.json'); }

  async load(): Promise<Settings> {
    const s = defaults();
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      if (typeof raw.site === 'string') s.site = raw.site;
      if (typeof raw.pairedAs === 'string') s.pairedAs = raw.pairedAs;
      if (typeof raw.startWithWindows === 'boolean') s.startWithWindows = raw.startWithWindows;
      if (typeof raw.obsEnabled === 'boolean') s.obsEnabled = raw.obsEnabled;
      if (typeof raw.obsAddress === 'string' && raw.obsAddress) s.obsAddress = raw.obsAddress;
      if (typeof raw.obsStartReplay === 'boolean') s.obsStartReplay = raw.obsStartReplay;
      if (typeof raw.alerts === 'boolean') s.alerts = raw.alerts;
      if (typeof raw.startMixItUp === 'boolean') s.startMixItUp = raw.startMixItUp;
      if (typeof raw.mixItUpPath === 'string') s.mixItUpPath = raw.mixItUpPath;
      if (typeof raw.lastSeenVersion === 'string') s.lastSeenVersion = raw.lastSeenVersion;
      if (typeof raw.controlKey === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw.controlKey)) s.controlKey = raw.controlKey;
      s.feed = cleanFeedSettings(raw.feed as Partial<FeedSettings> | undefined, s.feed);
      if (typeof raw.summary === 'boolean') s.summary = raw.summary;
      if (typeof raw.startObs === 'boolean') s.startObs = raw.startObs;
      if (typeof raw.obsPath === 'string') s.obsPath = raw.obsPath;
      const hk = raw.hotkeys as Record<string, unknown> | undefined;
      for (const k of HOTKEYS) if (typeof hk?.[k] === 'string') s.hotkeys[k] = (hk[k] as string).slice(0, 40);
      if (typeof raw.obsPassword === 'string' && raw.obsPassword) s.obsPassword = await this.cipher.decrypt(Buffer.from(raw.obsPassword, 'base64')).catch(() => '');
      if (typeof raw.token === 'string' && raw.token) s.token = await this.cipher.decrypt(Buffer.from(raw.token, 'base64'));
    } catch { /* no file yet, or a token this PC cannot decrypt: start unpaired */ }
    return s;
  }

  async save(s: Settings): Promise<void> {
    mkdirSync(join(this.file, '..'), { recursive: true });
    const seal = async (plain: string) => (plain ? (await this.cipher.encrypt(plain)).toString('base64') : '');
    const out = {
      site: s.site, pairedAs: s.pairedAs, startWithWindows: s.startWithWindows, obsEnabled: s.obsEnabled, obsAddress: s.obsAddress, obsStartReplay: s.obsStartReplay,
      alerts: s.alerts, startMixItUp: s.startMixItUp, mixItUpPath: s.mixItUpPath, lastSeenVersion: s.lastSeenVersion, controlKey: s.controlKey, hotkeys: s.hotkeys, feed: s.feed, summary: s.summary, startObs: s.startObs, obsPath: s.obsPath,
      obsPassword: await seal(s.obsPassword), token: await seal(s.token),
    };
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(out, null, 2));
    renameSync(tmp, this.file);
  }
}
