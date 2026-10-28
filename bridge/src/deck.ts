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
import { Unauthorized } from './site';
import type { StaffTools } from './staff';
import { CLOSE_REFUSED, DECK_HOST, DECK_PORTS, DECK_STATS, HELLO_MS, MAX_MESSAGE, PROTOCOL, parseClient, type DeckLinkFile, type DeckRequest, type DeckState, type DeckStaff, type DeckStatKind, type DeckStats, type ServerMessage } from './deckprotocol';
import type { StatFacts } from './obsstats';

export interface DeckOptions {
  /** streamdeck.json: where the port and the token are written for the plugin. */
  file: string;
  version: string;
  state: () => DeckState;
  run: (a: ControlAction) => Promise<ControlResult>;
  /** Test pull and Show a card: one staff action (the body of StaffTools' `do`), refused with a reason on a PC that is not a staff PC. */
  staff: (body: Record<string, unknown>) => Promise<ControlResult>;
  /** Pause / resume trading, Switch scene and Open preview (61.3): refused unless this is a staff PC whose role may do it (runStaffPcKey). */
  staffPc: (r: StaffPcRequest) => Promise<ControlResult>;
  /** A client came or went. */
  onChange: () => void;
  /** The set of stats the keys show changed (`wanted`). */
  onWanted?: () => void;
  log: (line: string) => void;
  ports?: readonly number[];
  helloMs?: number;
}

/** The stats the Stat keys show, from what the site last said for the OBS text sources (57.4). */
export function deckStats(f: StatFacts | null): DeckStats {
  return { ...(typeof f?.queue === 'number' ? { queue: f.queue } : {}), ...(typeof f?.packs === 'number' ? { packs: f.packs } : {}), ...(f?.goal !== undefined ? { goal: f.goal } : {}) };
}

/** A key's request as the action the Control tab and the tray run; null for the two that are staff actions (toStaff). */
export function toAction(r: DeckRequest): ControlAction | null {
  switch (r.what) {
    case 'skip': return { action: 'skip' };
    case 'clear-queue': return { action: 'clear-queue' };
    case 'test-pull':
    case 'show-card':
    case 'trading':
    case 'scene':
    case 'preview': return null;
    case 'buff': return { action: 'buff', id: r.id };
    case 'last-buff': return { action: 'last-buff' };
    case 'pause': return { action: 'pause' };
    case 'happy-end': return { action: 'happy-hour-end' };
    case 'happy-start': return { action: 'happy-hour-start', minutes: r.minutes, kind: r.kind, ...(r.kind === 'discount' ? { percent: r.percent } : {}) };
  }
}

/** The staff action of Test pull and Show a card, the same bodies as the Preview overlay window sends (57.10); null for every other request. */
export function toStaff(r: DeckRequest): Record<string, unknown> | null {
  if (r.what === 'test-pull') return { action: 'test-pull' };
  if (r.what === 'show-card') return { action: 'show-card', username: r.username };
  return null;
}

/** The three staff keys of 61.3 and the staffpages.ts action each needs (STAFF_NEEDS: a mod may trade and switch scenes, the preview address is admin). */
export type StaffPcRequest = Extract<DeckRequest, { what: 'trading' | 'scene' | 'preview' }>;
export const isStaffPcRequest = (r: DeckRequest): r is StaffPcRequest => r.what === 'trading' || r.what === 'scene' || r.what === 'preview';
const STAFF_KEY_NEEDS: Record<StaffPcRequest['what'], string> = { trading: 'trading', scene: 'scene', preview: 'preview-url' };
/** The staff actions the keys use, in the order of DeckStaff.can. */
export const DECK_STAFF_ACTIONS = ['trading', 'scene', 'preview-url'];

/** What the keys are told about the staff side: null on a PC that is not a staff PC; `can` null = a PC paired with a code (every action), else the account's role list. */
export function deckStaff(isStaff: boolean, can: string[] | null, tradingPaused: boolean, scene: string, scenes: string[]): DeckStaff | null {
  return isStaff ? { can: DECK_STAFF_ACTIONS.filter(a => !can || can.includes(a)), tradingPaused, scene, scenes } : null;
}

export interface StaffPcEnv {
  /** Read at each press, so a role that changed is used at once. */
  staff: () => DeckStaff | null;
  /** The same function as the Staff tab and the tray (pausing is not asked about in a Windows dialog: the key needs a 1 second hold). */
  setTrading: (pause: boolean) => Promise<ControlResult>;
  /** The Staff tab's scene switch (OBS, then the site's audit log). */
  scene: (name: string) => Promise<ControlResult>;
  openPreview: () => void;
  log: (line: string) => void;
}

/** Pause / resume trading, Switch scene and Open preview. The refusal is here, not only on the key: a PC that is not a staff PC, or whose role cannot do it, is turned away. */
export async function runStaffPcKey(env: StaffPcEnv, r: StaffPcRequest): Promise<ControlResult> {
  const staff = env.staff();
  let out: ControlResult;
  if (!staff) out = { ok: false, text: 'Staff tools are off for this PC' };
  else if (!staff.can.includes(STAFF_KEY_NEEDS[r.what])) out = { ok: false, text: 'This account\'s role cannot do that' };
  else {
    try {
      if (r.what === 'trading') out = await env.setTrading(r.pause);
      else if (r.what === 'scene') out = await env.scene(r.name);
      else { env.openPreview(); out = { ok: true, text: 'Opened the preview overlay' }; }
    } catch (e) { out = { ok: false, text: e instanceof Unauthorized ? 'Pair again' : e instanceof Error ? e.message : 'Something went wrong' }; }
  }
  env.log(`Staff: ${r.what} (Stream Deck key): ${out.ok ? 'ok' : 'refused'}, ${out.text}`);
  return { ok: out.ok, text: out.text };
}

/** A Test pull or Show a card key: the same staff action as the Preview overlay window, and only on a staff PC whose role may do it (else the key's alert, and the log says why). `can` null = every action. */
export async function runStaffKey(tools: Pick<StaffTools, 'run'> | null, isStaff: boolean, body: Record<string, unknown>, log: (line: string) => void, can: string[] | null = null): Promise<ControlResult> {
  let r: ControlResult;
  if (!tools || !isStaff) r = { ok: false, text: 'Staff tools are off for this PC' };
  else if (can && !can.includes(String(body.action))) r = { ok: false, text: 'This account\'s role cannot do that' };
  else {
    try { r = await tools.run({ op: 'do', ...body }); } catch (e) { r = { ok: false, text: e instanceof Unauthorized ? 'Pair again' : e instanceof Error ? e.message : 'Something went wrong' }; }
  }
  log(`Staff: ${String(body.action)} (Stream Deck key): ${r.ok ? 'ok' : 'refused'}, ${r.text}`);
  return { ok: r.ok, text: r.text };
}

export class DeckServer {
  /** Made fresh every time the app starts; the plugin reads it from streamdeck.json. */
  readonly token = randomBytes(24).toString('base64url');
  /** Why it is not listening (every port is taken), else ''. */
  error = '';
  private wss: WebSocketServer | null = null;
  private port = 0;
  private authed = new Set<WebSocket>();
  /** What each plugin said its keys show. */
  private wants = new Map<WebSocket, DeckStatKind[]>();
  private lastState = '';
  constructor(private o: DeckOptions) {}

  get listeningPort(): number { return this.port; }
  /** The stats a Stat key on any connected deck shows now; the app asks the site for stats only while this is not empty. */
  get wanted(): DeckStatKind[] {
    const all = new Set<DeckStatKind>();
    for (const w of this.wants.values()) for (const k of w) all.add(k);
    return DECK_STATS.filter(k => all.has(k));
  }
  /** At least one plugin has said hello with the token. */
  get connected(): boolean { return this.authed.size > 0; }
  /** A plugin has connected at least once since this server started (tells "never connected" from "went away"). */
  seen = false;

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
    const hadWants = this.wants.size > 0;
    this.wants.clear();
    if (hadWants) this.o.onWanted?.();
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
        this.seen = true;
        send({ t: 'welcome', version: this.o.version, state: this.o.state() });
        this.o.log(`Stream Deck plugin ${msg.version} connected`);
        this.o.onChange();
        return;
      }
      if (msg?.t === 'stats') {
        if (msg.want.length) this.wants.set(ws, msg.want); else this.wants.delete(ws);
        this.o.onWanted?.();
        return;
      }
      if (msg?.t !== 'do') return refuse();
      const n = msg.n;
      const action = toAction(msg.req);
      const job = action ? this.o.run(action) : isStaffPcRequest(msg.req) ? this.o.staffPc(msg.req) : this.o.staff(toStaff(msg.req) ?? {});
      job.catch(() => ({ ok: false, text: 'Something went wrong' })).then(r => send({ t: 'done', n, ok: r.ok, text: r.text.slice(0, 500) }));
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (this.wants.delete(ws)) this.o.onWanted?.();
      if (this.authed.delete(ws)) { this.o.log('Stream Deck plugin disconnected'); this.o.onChange(); }
    });
    ws.on('error', () => ws.terminate());
  }
}
