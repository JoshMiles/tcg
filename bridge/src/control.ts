// Control from the PC (ROADMAP 55.9). Plain TypeScript, no Electron. A tiny local web server for Stream Deck "Website" buttons (GET request
// in background) and the global hotkeys. Every press becomes one fixed action that main.ts forwards to the site (POST /api/bridge/action).
import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Fixed, and rarely used by other software (OBS is 4455, Mix It Up 8911). If it is taken the window says so. */
export const CONTROL_PORT = 47653;

/** What a button or hotkey asks for. `on` is for the window's pause switch; a button or hotkey toggles. */
export type ControlAction = { action: 'buff'; id: string } | { action: 'pause'; on?: boolean } | { action: 'refresh' } | { action: 'last-buff' } | { action: 'skip' } | { action: 'clear-queue' } | { action: 'status' };
export interface ControlResult { ok: boolean; text: string }

export const newControlKey = (): string => randomBytes(18).toString('base64url');

/** The button's path after the key, e.g. `buff/<id>`, `pause`. Null for anything that is not a button. */
export function parseButton(rest: string): ControlAction | null {
  const parts = rest.split('/');
  try {
    if (parts[0] === 'buff' && parts.length === 2 && parts[1]) return { action: 'buff', id: decodeURIComponent(parts[1]) };
  } catch { return null; }
  if (parts.length !== 1) return null;
  return parts[0] === 'pause' || parts[0] === 'refresh' ? { action: parts[0] } : parts[0] === 'last-buff' ? { action: 'last-buff' } : null;
}

export const buttonUrl = (key: string, path: string, port = CONTROL_PORT): string => `http://127.0.0.1:${port}/${key}/${path}`;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class ControlServer {
  private server: Server | null = null;
  /** Why it is not listening (the port is taken), else ''. */
  error = '';
  constructor(private key: string, private run: (a: ControlAction) => Promise<ControlResult>, private port = CONTROL_PORT) {}

  get listeningPort(): number { const a = this.server?.address(); return a && typeof a === 'object' ? a.port : 0; }

  start(): Promise<void> {
    return new Promise(resolve => {
      const server = createServer((req, res) => void this.handle(req.method ?? '', req.url ?? '', req.headers, (code, body) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(body); }));
      server.once('error', e => { this.error = (e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? `Port ${this.port} is used by another program, so the Stream Deck buttons cannot work.` : `The Stream Deck buttons cannot start (${(e as Error).message}).`; resolve(); });
      server.listen(this.port, '127.0.0.1', () => { this.server = server; resolve(); }); // this PC only
    });
  }

  stop(): Promise<void> {
    return new Promise(resolve => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private async handle(method: string, url: string, headers: Record<string, string | string[] | undefined>, send: (code: number, body: string) => void): Promise<void> {
    if (method !== 'GET') return send(405, 'GET only');
    if (headers.origin !== undefined || headers['sec-fetch-site'] !== undefined) return send(403, 'Not from a web page'); // browsers add one of these; a Stream Deck adds neither
    const port = this.listeningPort;
    if (headers.host !== `127.0.0.1:${port}` && headers.host !== `localhost:${port}`) return send(403, 'Wrong host'); // a name pointed at this PC from the web
    const m = /^\/([A-Za-z0-9_-]+)\/([^?#]*)/.exec(url);
    const action = m && same(m[1], this.key) ? parseButton(m[2]) : null;
    if (!action) return send(404, 'Not found');
    const r = await this.run(action).catch(() => ({ ok: false, text: 'Something went wrong' }));
    send(r.ok ? 200 : 422, r.text);
  }
}

// ── Global hotkeys ──

export const HOTKEYS = ['refresh', 'pause', 'lastBuff'] as const;
export type HotkeyName = (typeof HOTKEYS)[number];
export type HotkeyMap = Record<HotkeyName, string>;
export const noHotkeys = (): HotkeyMap => ({ refresh: '', pause: '', lastBuff: '' });
export const HOTKEY_ACTION: Record<HotkeyName, ControlAction> = { refresh: { action: 'refresh' }, pause: { action: 'pause' }, lastBuff: { action: 'last-buff' } };

/** Electron's `globalShortcut`, or a stand-in in the checks. */
export interface Registrar { register(accelerator: string, cb: () => void): boolean; unregister(accelerator: string): void }

export class Hotkeys {
  private active: string[] = [];
  constructor(private reg: Registrar, private press: (name: HotkeyName) => void) {}

  /** Replaces every shortcut with the ones in `map`. Says, per action, why one could not be set (a clash with another program, or a shortcut Electron does not know). */
  apply(map: HotkeyMap): Partial<Record<HotkeyName, string>> {
    this.stop();
    const errors: Partial<Record<HotkeyName, string>> = {};
    for (const name of HOTKEYS) {
      const accel = map[name].trim();
      if (!accel) continue;
      if (this.active.some(a => a.toLowerCase() === accel.toLowerCase())) { errors[name] = 'Already used for another action here'; continue; }
      try {
        if (this.reg.register(accel, () => this.press(name))) this.active.push(accel);
        else errors[name] = 'Another program already uses this shortcut';
      } catch { errors[name] = 'That is not a shortcut (try Ctrl+Alt+R)'; }
    }
    return errors;
  }

  stop(): void {
    for (const a of this.active) this.reg.unregister(a);
    this.active = [];
  }
}
