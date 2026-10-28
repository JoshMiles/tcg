// A fake Twitch for the checks: the EventSub WebSocket server (welcome, keepalive, reconnect, revocation, notification) and the Helix
// subscriptions endpoint. Both only listen on 127.0.0.1; nothing here ever reaches the real Twitch.
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

export interface HelixCall { token: string; clientId: string; status: number; body: { type: string; version: string; condition: Record<string, string>; transport: { method: string; session_id: string } } }

export class FakeTwitch {
  /** Twitch's keepalive_timeout_seconds in the welcome. */
  keepaliveSec = 10;
  /** Send a keepalive this often (ms); 0 = never (a silent connection). */
  keepaliveEvery = 0;
  /** Hold back the welcome of a connection made after session_reconnect until releaseWelcome(). */
  holdReconnectWelcome = false;
  /** Helix: access tokens it answers 401 to, and a status to answer per subscription type. */
  rejectTokens = new Set<string>();
  statusFor: Record<string, number> = {};
  calls: HelixCall[] = [];
  /** Every connection ever made, and how many are open now. */
  connections = 0;
  sessionId = `sess-${randomUUID().slice(0, 8)}`;
  private sockets = new Set<WebSocket>();
  private held: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setInterval>>();
  private wss: WebSocketServer | null = null;
  private http: Server | null = null;
  private wsPort = 0;
  private httpPort = 0;

  get wsUrl(): string { return `ws://127.0.0.1:${this.wsPort}/ws`; }
  get helixUrl(): string { return `http://127.0.0.1:${this.httpPort}/helix/eventsub/subscriptions`; }
  get open(): number { return [...this.sockets].filter(s => s.readyState === s.OPEN).length; }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 }, resolve);
      wss.on('error', reject);
      wss.on('connection', (ws, req) => this.onConnection(ws, (req.url ?? '').includes('reconnected')));
      this.wss = wss;
    });
    this.wsPort = (this.wss!.address() as { port: number }).port;
    this.http = createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
        const j = (body ? JSON.parse(body) : {}) as HelixCall['body'];
        const status = this.rejectTokens.has(token) ? 401 : (this.statusFor[j.type] ?? 202);
        this.calls.push({ token, clientId: String(req.headers['client-id'] ?? ''), status, body: j });
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(status === 202 ? { data: [{ id: randomUUID(), status: 'enabled', type: j.type }] } : { message: 'no' }));
      });
    });
    await new Promise<void>(r => this.http!.listen(0, '127.0.0.1', r));
    this.httpPort = (this.http.address() as { port: number }).port;
  }

  private frame(type: string, payload: unknown, id: string = randomUUID()): string {
    return JSON.stringify({ metadata: { message_id: id, message_type: type, message_timestamp: new Date().toISOString() }, payload });
  }

  private welcome(ws: WebSocket): void {
    ws.send(this.frame('session_welcome', { session: { id: this.sessionId, status: 'connected', keepalive_timeout_seconds: this.keepaliveSec, reconnect_url: null } }));
    if (this.keepaliveEvery > 0) {
      const t = setInterval(() => { if (ws.readyState === ws.OPEN) ws.send(this.frame('session_keepalive', {})); }, this.keepaliveEvery);
      this.timers.add(t);
      ws.on('close', () => { clearInterval(t); this.timers.delete(t); });
    }
  }

  private onConnection(ws: WebSocket, reconnected: boolean): void {
    this.connections++;
    this.sockets.add(ws);
    ws.on('close', () => this.sockets.delete(ws));
    if (reconnected && this.holdReconnectWelcome) this.held.push(() => this.welcome(ws));
    else this.welcome(ws);
  }

  /** Tells every open client to move to a new address on this server; the old connection stays open. */
  reconnect(url = `${this.wsUrl}?reconnected=1`): void {
    for (const s of this.sockets) s.send(this.frame('session_reconnect', { session: { id: this.sessionId, status: 'reconnecting', keepalive_timeout_seconds: null, reconnect_url: url } }));
  }
  releaseWelcome(): void { for (const f of this.held.splice(0)) f(); }

  notify(type: string, event: unknown, id: string = randomUUID(), to?: 'oldest' | 'newest'): void {
    const list = [...this.sockets].filter(s => s.readyState === s.OPEN);
    const targets = to === 'oldest' ? list.slice(0, 1) : to === 'newest' ? list.slice(-1) : list;
    for (const s of targets) s.send(this.frame('notification', { subscription: { id: randomUUID(), type, version: '1', status: 'enabled' }, event }, id));
  }
  revoke(type: string, status = 'authorization_revoked'): void {
    for (const s of this.sockets) s.send(this.frame('revocation', { subscription: { id: randomUUID(), type, version: '1', status } }));
  }
  dropAll(code = 1006): void { for (const s of this.sockets) s.close(code === 1006 ? 4006 : code); }

  async close(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    for (const s of this.sockets) s.terminate();
    await new Promise<void>(r => this.wss?.close(() => r()));
    await new Promise<void>(r => (this.http ? this.http.close(() => r()) : r()));
  }
}
