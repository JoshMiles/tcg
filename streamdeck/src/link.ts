// The plugin's link to TCG Bridge (ROADMAP 57.13a). Reads streamdeck.json (port and token, written by the app), connects to 127.0.0.1, sends the token first and
// retries every few seconds. No SDK and no `ws` import: the socket comes in through `connect`, so bridge/scripts/check-deck.ts runs this against the real server.
import { readFileSync } from 'node:fs';
import { DECK_HOST, PROTOCOL, parseLinkFile, parseServer, type ClientMessage, type DeckRequest, type DeckState, type DeckStatKind } from './protocol';

/** The few things the link needs from a WebSocket. */
export interface Socket {
  send(data: string): void;
  close(): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  /** Called once when the socket ends, for any reason (refused, refused host, app closed). */
  onClose(cb: () => void): void;
}

export interface LinkOptions {
  /** %APPDATA%\TCG Bridge\streamdeck.json */
  file: string;
  /** The plugin's own version, shown in the app's log. */
  version: string;
  connect(url: string): Socket;
  /** The state changed, or the link came up or went down (`link.state` is null when down). */
  onChange(): void;
  retryMs?: number;
  requestMs?: number;
}

export interface Answer { ok: boolean; text: string }

export class BridgeLink {
  /** The app's state; null while not connected. */
  state: DeckState | null = null;
  private socket: Socket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private n = 0;
  private wanted: DeckStatKind[] = [];
  private pending = new Map<number, { done: (a: Answer) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private o: LinkOptions) {}

  start(): void {
    this.stopped = false;
    this.attempt();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }

  /** Tells the app which stats the visible Stat keys show (all of them, [] = none), now if connected and again after every reconnect. */
  want(list: DeckStatKind[]): void {
    if (list.join() === this.wanted.join()) return;
    this.wanted = list;
    if (this.socket && this.state) this.socket.send(JSON.stringify({ t: 'stats', want: list } satisfies ClientMessage));
  }

  /** Asks the app to do something; the answer is the app's own words. Never rejects. */
  request(req: DeckRequest): Promise<Answer> {
    const socket = this.socket;
    if (!socket || !this.state) return Promise.resolve({ ok: false, text: 'TCG Bridge is not running' });
    return new Promise(resolve => {
      const n = ++this.n;
      const timer = setTimeout(() => { this.pending.delete(n); resolve({ ok: false, text: 'No answer from TCG Bridge' }); }, this.o.requestMs ?? 20_000);
      this.pending.set(n, { done: resolve, timer });
      socket.send(JSON.stringify({ t: 'do', n, req } satisfies ClientMessage));
    });
  }

  private attempt(): void {
    if (this.stopped || this.socket) return;
    let link = null;
    try { link = parseLinkFile(readFileSync(this.o.file, 'utf8')); } catch { /* the app is not running, or the switch is off */ }
    if (!link) return this.retry();
    const token = link.token;
    let socket: Socket;
    try { socket = this.o.connect(`ws://${DECK_HOST}:${link.port}`); } catch { return this.retry(); }
    this.socket = socket;
    socket.onOpen(() => socket.send(JSON.stringify({ t: 'hello', token, protocol: PROTOCOL, version: this.o.version } satisfies ClientMessage)));
    socket.onMessage(raw => {
      const m = parseServer(raw);
      if (!m) return;
      if (m.t === 'welcome') {
        this.state = m.state;
        if (this.wanted.length) socket.send(JSON.stringify({ t: 'stats', want: this.wanted } satisfies ClientMessage));
        this.o.onChange();
      } else if (m.t === 'state' && this.state) { this.state = m.state; this.o.onChange(); }
      else if (m.t === 'done') {
        const p = this.pending.get(m.n);
        if (p) { clearTimeout(p.timer); this.pending.delete(m.n); p.done({ ok: m.ok, text: m.text }); }
      }
    });
    socket.onClose(() => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.done({ ok: false, text: 'TCG Bridge closed' }); }
      this.pending.clear();
      if (this.state) { this.state = null; this.o.onChange(); }
      this.retry();
    });
  }

  private retry(): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.attempt(), this.o.retryMs ?? 3000);
  }
}
