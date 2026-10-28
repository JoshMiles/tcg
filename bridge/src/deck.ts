// The link to the Stream Deck plugin (ROADMAP 57.13). Plain TypeScript, no Electron. A WebSocket server on 127.0.0.1 only: it writes its port and a fresh
// token to streamdeck.json, and a client must send the token first. It carries no logic of its own: a key's request is run by the same function as the Control
// tab and the tray (main.ts runControl), and the app's state is pushed to the keys.
import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { same, type ControlAction, type ControlResult } from './control';
import { CLOSE_REFUSED, DECK_HOST, DECK_PORTS, HELLO_MS, MAX_MESSAGE, PROTOCOL, parseClient, type DeckLinkFile, type DeckRequest, type DeckState, type ServerMessage } from './deckprotocol';

export interface DeckOptions {
  /** streamdeck.json: where the port and the token are written for the plugin. */
  file: string;
  version: string;
  state: () => DeckState;
  run: (a: ControlAction) => Promise<ControlResult>;
  /** A client came or went. */
  onChange: () => void;
  log: (line: string) => void;
  ports?: readonly number[];
  helloMs?: number;
}

/** A key's request as the action the Control tab and the tray run. */
export function toAction(r: DeckRequest): ControlAction {
  switch (r.what) {
    case 'buff': return { action: 'buff', id: r.id };
    case 'last-buff': return { action: 'last-buff' };
    case 'pause': return { action: 'pause' };
    case 'happy-end': return { action: 'happy-hour-end' };
    case 'happy-start': return { action: 'happy-hour-start', minutes: r.minutes, kind: r.kind, ...(r.kind === 'discount' ? { percent: r.percent } : {}) };
  }
}

export class DeckServer {
  /** Made fresh every time the app starts; the plugin reads it from streamdeck.json. */
  readonly token = randomBytes(24).toString('base64url');
  /** Why it is not listening (every port is taken), else ''. */
  error = '';
  private wss: WebSocketServer | null = null;
  private port = 0;
  private authed = new Set<WebSocket>();
  private lastState = '';
  constructor(private o: DeckOptions) {}

  get listeningPort(): number { return this.port; }
  /** At least one plugin has said hello with the token. */
  get connected(): boolean { return this.authed.size > 0; }

  async start(): Promise<void> {
    const ports = this.o.ports ?? DECK_PORTS;
    for (const port of ports) {
      const wss = await this.listen(port);
      if (!wss) continue;
      this.wss = wss;
      this.port = (wss.address() as AddressInfo).port;
      try {
        const link: DeckLinkFile = { port: this.port, token: this.token };
        mkdirSync(dirname(this.o.file), { recursive: true });
        writeFileSync(this.o.file + '.tmp', JSON.stringify(link));
        renameSync(this.o.file + '.tmp', this.o.file);
      } catch (e) {
        this.error = `The Stream Deck plugin cannot find the app (${(e as Error).message}).`;
        await this.stop();
      }
      return;
    }
    this.error = `Ports ${ports[0]} to ${ports[ports.length - 1]} are used by other programs, so the Stream Deck plugin cannot connect.`;
  }

  /** The file goes first: a plugin that reads it later finds no server rather than a dead port. */
  async stop(): Promise<void> {
    try { unlinkSync(this.o.file); } catch { /* not written */ }
    const wss = this.wss;
    this.wss = null;
    const had = this.authed.size > 0;
    for (const ws of this.authed) ws.terminate();
    this.authed.clear();
    if (had) this.o.onChange();
    if (wss) await new Promise<void>(resolve => wss.close(() => resolve()));
  }

  /** Sends the state to every plugin when it changed since the last time. */
  broadcast(): void {
    const json = JSON.stringify({ t: 'state', state: this.o.state() } satisfies ServerMessage);
    if (json === this.lastState) return;
    this.lastState = json;
    for (const ws of this.authed) ws.send(json);
  }

  private listen(port: number): Promise<WebSocketServer | null> {
    return new Promise(resolve => {
      const wss = new WebSocketServer({ host: DECK_HOST, port, maxPayload: MAX_MESSAGE, verifyClient: (info: { req: IncomingMessage }) => this.allowed(info.req) }); // this PC only
      wss.once('error', () => { wss.close(); resolve(null); });
      wss.once('listening', () => { wss.on('error', () => undefined); wss.on('connection', ws => this.accept(ws)); resolve(wss); });
    });
  }

  /** A browser always sends an Origin and the Stream Deck plugin never does; the Host must be this PC's own address (a name pointed here from the web is refused). */
  private allowed(req: IncomingMessage): boolean {
    return req.headers.origin === undefined && (req.headers.host === `127.0.0.1:${this.port}` || req.headers.host === `localhost:${this.port}`);
  }

  private accept(ws: WebSocket): void {
    const refuse = () => ws.close(CLOSE_REFUSED, 'Refused');
    const timer = setTimeout(refuse, this.o.helloMs ?? HELLO_MS);
    let ok = false;
    const send = (m: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
    ws.on('message', (data, isBinary) => {
      const msg = isBinary ? null : parseClient(data.toString());
      if (!ok) { // the first message must be a hello with the token
        if (msg?.t !== 'hello' || msg.protocol !== PROTOCOL || !same(msg.token, this.token)) return refuse();
        ok = true;
        clearTimeout(timer);
        this.authed.add(ws);
        send({ t: 'welcome', version: this.o.version, state: this.o.state() });
        this.o.log(`Stream Deck plugin ${msg.version} connected`);
        this.o.onChange();
        return;
      }
      if (msg?.t !== 'do') return refuse();
      const n = msg.n;
      this.o.run(toAction(msg.req)).catch(() => ({ ok: false, text: 'Something went wrong' })).then(r => send({ t: 'done', n, ok: r.ok, text: r.text.slice(0, 500) }));
    });
    ws.on('close', () => { clearTimeout(timer); if (this.authed.delete(ws)) { this.o.log('Stream Deck plugin disconnected'); this.o.onChange(); } });
    ws.on('error', () => ws.terminate());
  }
}
