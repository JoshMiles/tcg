// What the app remembers between runs. The token is encrypted by whatever `Cipher` the caller gives (Electron's safeStorage in main.ts).
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings { site: string; token: string; pairedAs: string; startWithWindows: boolean }
export const DEFAULT_SITE = 'https://cheesytcg.app';
export const defaults = (): Settings => ({ site: DEFAULT_SITE, token: '', pairedAs: '', startWithWindows: true });

export interface Cipher { encrypt(plain: string): Promise<Buffer>; decrypt(data: Buffer): Promise<string> }
export interface SettingsStore { load(): Promise<Settings>; save(s: Settings): Promise<void> }

/** settings.json in `dir`; the token is stored as base64 of the encrypted bytes, never in plain text. */
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
      if (typeof raw.token === 'string' && raw.token) s.token = await this.cipher.decrypt(Buffer.from(raw.token, 'base64'));
    } catch { /* no file yet, or a token this PC cannot decrypt: start unpaired */ }
    return s;
  }

  async save(s: Settings): Promise<void> {
    mkdirSync(join(this.file, '..'), { recursive: true });
    const out = { site: s.site, pairedAs: s.pairedAs, startWithWindows: s.startWithWindows, token: s.token ? (await this.cipher.encrypt(s.token)).toString('base64') : '' };
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(out, null, 2));
    renameSync(tmp, this.file);
  }
}
