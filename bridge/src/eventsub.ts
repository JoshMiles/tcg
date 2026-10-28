// Twitch EventSub over WebSocket (ROADMAP 58.2). Plain TypeScript, no Electron: BridgeService owns one EventSubClient.
// It asks the site for a short-lived access token (the site holds the refresh token), opens wss://eventsub.wss.twitch.tv/ws, creates the Helix
// subscriptions for each new session, and hands every notification to the site (POST /api/bridge/twitch-event), which records it and awards
// nothing. Tokens are never logged. The pure parts (parseMessage, keepaliveLimitMs, subscriptionBody, failureText) are exported for the checks.
import WebSocket from 'ws';
import { Unauthorized, type SiteClient, type TwitchToken } from './site';

export type EsState = 'off' | 'connecting' | 'connected' | 'reconnecting';
/** Why it is not fully working: none = no channel connected (quiet), forbidden = this PC may not listen, ended = Twitch ended the connection,
 *  site = no token from the site, twitch = Twitch not reachable, subs = a subscription failed or was revoked. '' = all good. */
export type EsWhy = '' | 'none' | 'forbidden' | 'ended' | 'site' | 'twitch' | 'subs';
export interface EsSub { type: string; status: 'enabled' | 'failed' | 'revoked'; error?: string }
/** chat: null until the site has answered once; on = the channel has the chat scopes; commands = how many the site listed. */
export interface EsStatus { state: EsState; why: EsWhy; reason: string; login: string; testing: boolean; subs: EsSub[]; lastEventAt: number | null; since: number | null; chat?: { on: boolean; commands: number } | null }

export const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';
export const HELIX_SUBSCRIPTIONS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';
export const SUBSCRIPTIONS: { type: string; version: string; condition: (id: string) => Record<string, string> }[] = [
  { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: id => ({ broadcaster_user_id: id }) },
  { type: 'channel.cheer', version: '1', condition: id => ({ broadcaster_user_id: id }) },
  { type: 'channel.subscription.gift', version: '1', condition: id => ({ broadcaster_user_id: id }) },
  { type: 'channel.raid', version: '1', condition: id => ({ to_broadcaster_user_id: id }) },
  { type: 'stream.online', version: '1', condition: id => ({ broadcaster_user_id: id }) },
  { type: 'stream.offline', version: '1', condition: id => ({ broadcaster_user_id: id }) },
];
/** The seventh subscription (58.6b): created only when the site says the token has the chat scopes. Kept out of SUBSCRIPTIONS so "all subscriptions on" stays true without it. */
export const CHAT_TYPE = 'channel.chat.message';
export const CHAT_SUBSCRIPTION: (typeof SUBSCRIPTIONS)[number] = { type: CHAT_TYPE, version: '1', condition: id => ({ broadcaster_user_id: id, user_id: id }) };

/** The first word of a chat message, lowercased ('' when there is none). */
export function chatWord(event: unknown): string {
  const text = (event as { message?: { text?: unknown } } | null)?.message?.text;
  return typeof text === 'string' ? (text.trim().split(/\s+/)[0] ?? '').toLowerCase() : '';
}

/** The one line on the Twitch connection about chat ('' = say nothing). */
export function chatLine(t: Pick<EsStatus, 'state' | 'subs' | 'chat'> | null | undefined): string {
  if (!t || t.state !== 'connected' || !t.chat) return '';
  if (t.subs.some(s => s.type === CHAT_TYPE && s.status === 'enabled')) return `Chat commands: ${t.chat.commands} ${t.chat.commands === 1 ? 'command' : 'commands'}, through TCG Bridge`;
  return t.chat.on ? '' : 'Chat commands: reconnect the channel on the site to allow chat';
}

export interface EsMessage { type: string; id: string; payload: Record<string, unknown> }
/** One WebSocket frame, or null when it is not an EventSub message. */
export function parseMessage(raw: string): EsMessage | null {
  let j: { metadata?: { message_type?: unknown; message_id?: unknown }; payload?: unknown };
  try { j = JSON.parse(raw); } catch { return null; }
  const m = j?.metadata;
  if (!m || typeof m.message_type !== 'string' || typeof m.message_id !== 'string') return null;
  return { type: m.message_type, id: m.message_id, payload: j.payload && typeof j.payload === 'object' ? (j.payload as Record<string, unknown>) : {} };
}

/** How long a socket may stay silent: Twitch's keepalive timeout plus a margin (Twitch sends a keepalive at least that often). */
export const keepaliveLimitMs = (seconds: unknown, marginS: number): number => ((typeof seconds === 'number' && seconds > 0 ? seconds : 10) + marginS) * 1000;

/** The body of one Helix subscription for a session. */
export const subscriptionBody = (s: (typeof SUBSCRIPTIONS)[number], broadcasterId: string, sessionId: string) =>
  ({ type: s.type, version: s.version, condition: s.condition(broadcasterId), transport: { method: 'websocket', session_id: sessionId } });

/** A short line for a refused subscription. */
export function failureText(status: number): string {
  if (status === 401) return 'Twitch rejected the token';
  if (status === 403) return 'a permission is missing: connect the channel again on the site';
  if (status === 429) return 'Twitch is limiting requests';
  return `Twitch answered ${status}`;
}

/** Production only follows a reconnect_url on Twitch's EventSub host; the address is rebuilt on that fixed host so only its path and query come from the message. */
export const twitchReconnectUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'wss:' || u.hostname !== 'eventsub.wss.twitch.tv' || u.port) return null;
    return 'wss://eventsub.wss.twitch.tv/' + u.pathname.replace(/^\/+/, '') + u.search;
  } catch { return null; }
};

export const OFF_TEXT: Record<'none' | 'forbidden' | 'ended' | 'site' | 'unauthorized', string> = {
  none: 'No Twitch channel is connected on the site.',
  forbidden: 'The site does not let this PC listen to Twitch. Only a PC signed in as an admin can.',
  ended: 'Twitch ended the channel connection. Connect the channel again on the site.',
  site: 'TCG Bridge could not get a Twitch token from the site.',
  unauthorized: 'The site no longer accepts this PC.',
};

export interface EventSubOptions {
  wsUrl: string;
  helixUrl: string;
  /** The address to follow for a reconnect_url, or null to refuse it (the checks point it at a local server). */
  reconnectTo: (url: string) => string | null;
  /** Added to Twitch's keepalive timeout before a silent socket is dropped. */
  keepaliveMarginS: number;
  /** How often the site is asked whether a channel is still connected, which also renews the token. */
  recheckMs: number;
  /** How often the site's chat command list is fetched while connected (58.6b). */
  chatMs: number;
  /** The token is renewed this long before it expires. */
  refreshLeadMs: number;
  backoffMs: { min: number; max: number };
  /** A report to the site is sent again after this long even when nothing changed. */
  reportMs: number;
  /** Wait between tries of one event, and before the one retry of a "subscription already exists". */
  retryMs: number;
  log: (line: string) => void;
  onChange: () => void;
  /** Gives the token to the log's redaction. */
  secret: (token: string) => void;
}

type SessionEnd = { kind: 'lost'; welcomed: boolean } | { kind: 'gone'; why: 'none' | 'forbidden' | 'ended' } | { kind: 'stop' };
type Answer = Awaited<ReturnType<SiteClient['twitchToken']>> | { kind: 'unauthorized' };
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(done, ms);
  function done() { clearTimeout(t); signal.removeEventListener('abort', done); resolve(); }
  signal.addEventListener('abort', done);
});
const QUEUE_MAX = 100;
const SEEN_MAX = 500;

export class EventSubClient {
  readonly state: EsStatus = { state: 'off', why: 'none', reason: OFF_TEXT.none, login: '', testing: false, subs: [], lastEventAt: null, since: null };
  private o: EventSubOptions;
  private abort = new AbortController();
  private done: Promise<void> = Promise.resolve();
  private token: TwitchToken | null = null;
  private refreshing: Promise<void> | null = null;
  private sock: WebSocket | null = null;
  private pending: WebSocket | null = null;
  private watch = new Map<WebSocket, { limit: number; timer: ReturnType<typeof setTimeout> | null }>();
  private seen = new Set<string>();
  private end: ((r: SessionEnd) => void) | null = null;
  private welcomed = false;
  private recheckTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private chatTimer: ReturnType<typeof setInterval> | null = null;
  private chatList = new Set<string>();
  private chatSubscribed = false; // whether this session's subscriptions include the chat one
  private queue: { messageId: string; type: string; event: unknown; tries: number }[] = [];
  private flushing = false;
  private reportKey = '';
  private reportAt = 0;
  private reported: EsState | null = null;

  constructor(private client: Pick<SiteClient, 'twitchToken' | 'twitchEvent' | 'report' | 'chatCommands'>, opts: Partial<EventSubOptions> = {}) {
    this.o = {
      wsUrl: EVENTSUB_URL, helixUrl: HELIX_SUBSCRIPTIONS_URL, reconnectTo: twitchReconnectUrl, keepaliveMarginS: 10, recheckMs: 300_000, chatMs: 300_000, refreshLeadMs: 120_000,
      backoffMs: { min: 1000, max: 30_000 }, reportMs: 60_000, retryMs: 1000, log: () => undefined, onChange: () => undefined, secret: () => undefined, ...opts,
    };
  }

  start(): void {
    this.done = this.run();
    this.heartbeat = setInterval(() => this.maybeReport(), Math.min(5000, this.o.reportMs));
    this.heartbeat.unref?.();
  }

  async stop(): Promise<void> {
    this.abort.abort();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.end?.({ kind: 'stop' });
    await this.done;
  }

  /** Asks the site again now (after "Check again" in the window). */
  recheckNow(): void { if (this.recheckTimer) { clearTimeout(this.recheckTimer); void this.recheck(); } }

  // ── the loop: token, one session, wait ──

  private async run(): Promise<void> {
    const { signal } = this.abort;
    let backoff = this.o.backoffMs.min;
    while (!signal.aborted) {
      let wait = this.o.recheckMs;
      const a = await this.ask();
      if (signal.aborted) return;
      if (a.kind !== 'ok') {
        this.setOff(a.kind);
        if (a.kind === 'unavailable' || a.kind === 'unauthorized') { wait = backoff; backoff = Math.min(backoff * 2, this.o.backoffMs.max); }
      } else {
        this.adopt(a.token);
        const r = await this.session();
        if (r.kind === 'stop') return;
        if (r.kind === 'gone') this.setOff(r.why);
        else {
          if (r.welcomed) backoff = this.o.backoffMs.min;
          wait = backoff;
          backoff = Math.min(backoff * 2, this.o.backoffMs.max);
          this.set({ state: 'reconnecting', why: this.state.why === 'subs' ? '' : this.state.why, reason: 'Lost the connection to Twitch. Trying again.' });
        }
      }
      await sleep(wait, signal);
    }
  }

  private async ask(): Promise<Answer> {
    try { return await this.client.twitchToken(); } catch (e) { return e instanceof Unauthorized ? { kind: 'unauthorized' } : { kind: 'unavailable' }; }
  }

  private adopt(t: TwitchToken): void {
    this.token = t;
    this.o.secret(t.accessToken);
    this.state.login = t.login;
    this.state.testing = t.testing;
  }

  private setOff(kind: 'none' | 'forbidden' | 'ended' | 'unavailable' | 'unauthorized'): void {
    const why: EsWhy = kind === 'unavailable' || kind === 'unauthorized' ? 'site' : kind;
    if (this.state.state !== 'off' || this.state.why !== why) this.o.log(`Twitch events: off (${why})`);
    if (kind === 'none' || kind === 'forbidden') Object.assign(this.state, { login: '', testing: false });
    this.set({ state: 'off', why, reason: OFF_TEXT[kind === 'unavailable' ? 'site' : kind], subs: [], since: null });
  }

  private set(patch: Partial<EsStatus>): void {
    Object.assign(this.state, patch);
    this.changed();
  }

  private changed(): void {
    this.o.onChange();
    this.maybeReport();
  }

  // ── one session: sockets, keepalive, token upkeep ──

  private session(): Promise<SessionEnd> {
    return new Promise<SessionEnd>(resolve => {
      this.welcomed = false;
      this.end = r => {
        if (!this.end) return;
        this.end = null;
        this.teardown();
        resolve(r.kind === 'lost' ? { kind: 'lost', welcomed: this.welcomed } : r);
      };
      if (this.state.state === 'off') this.set({ state: 'connecting', why: '', reason: 'Connecting to Twitch.' });
      this.open(this.o.wsUrl, false);
      this.scheduleRecheck();
    });
  }

  private teardown(): void {
    if (this.recheckTimer) clearTimeout(this.recheckTimer);
    this.recheckTimer = null;
    if (this.chatTimer) clearInterval(this.chatTimer);
    this.chatTimer = null;
    for (const ws of [this.sock, this.pending]) if (ws) this.retire(ws);
    this.sock = null;
    this.pending = null;
  }

  private retire(ws: WebSocket): void {
    const w = this.watch.get(ws);
    if (w?.timer) clearTimeout(w.timer);
    this.watch.delete(ws);
    try { ws.close(); } catch { /* already gone */ }
    setTimeout(() => { try { ws.terminate(); } catch { /* already gone */ } }, 2000).unref?.();
  }

  private open(url: string, isReconnect: boolean): void {
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 1 << 20 });
    if (isReconnect) this.pending = ws; else this.sock = ws;
    this.watch.set(ws, { limit: keepaliveLimitMs(undefined, this.o.keepaliveMarginS), timer: null });
    this.arm(ws);
    ws.on('message', data => this.onMessage(ws, data.toString()));
    ws.on('error', e => this.o.log(`Twitch events: socket error (${e instanceof Error ? e.message : 'unknown'})`));
    ws.on('close', code => this.onClose(ws, code));
  }

  /** (Re)starts the silence timer of a socket: no message within its limit = it is dead. */
  private arm(ws: WebSocket): void {
    const w = this.watch.get(ws);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => { this.o.log('Twitch events: no message in time, reconnecting'); try { ws.terminate(); } catch { /* already gone */ } }, w.limit);
  }

  private onClose(ws: WebSocket, code: number): void {
    const w = this.watch.get(ws);
    if (w?.timer) clearTimeout(w.timer);
    this.watch.delete(ws);
    if (ws === this.pending) { this.pending = null; this.o.log(`Twitch events: the new connection closed (${code})`); this.end?.({ kind: 'lost', welcomed: this.welcomed }); return; }
    if (ws !== this.sock) return; // an old connection we replaced
    this.sock = null;
    this.o.log(`Twitch events: the connection closed (${code})`);
    if (!this.pending) this.end?.({ kind: 'lost', welcomed: this.welcomed });
  }

  private onMessage(ws: WebSocket, raw: string): void {
    if (ws !== this.sock && ws !== this.pending) return;
    const w = this.watch.get(ws);
    const m = parseMessage(raw);
    if (!m) return;
    if (this.seen.has(m.id)) return; // Twitch can send a message again after a reconnect
    this.seen.add(m.id);
    if (this.seen.size > SEEN_MAX) this.seen.delete(this.seen.values().next().value as string);
    const session = m.payload.session as { id?: unknown; keepalive_timeout_seconds?: unknown; reconnect_url?: unknown } | undefined;
    switch (m.type) {
      case 'session_welcome': {
        if (w) w.limit = keepaliveLimitMs(session?.keepalive_timeout_seconds, this.o.keepaliveMarginS);
        this.arm(ws);
        if (ws === this.pending) { // the new connection answered: events now come here, the old one is closed. Its subscriptions came with it.
          const old = this.sock;
          this.sock = ws;
          this.pending = null;
          if (old) this.retire(old);
          this.o.log('Twitch events: switched to the new connection');
          void this.refreshChat();
          break;
        }
        if (typeof session?.id !== 'string') break;
        this.welcomed = true;
        this.o.log('Twitch events: connected');
        this.set({ state: 'connected', why: '', reason: '', since: Date.now() });
        void this.subscribe(session.id, ws);
        break;
      }
      case 'session_keepalive':
        this.arm(ws);
        break;
      case 'session_reconnect': {
        this.arm(ws);
        const url = session?.reconnect_url;
        if (ws !== this.sock || this.pending) break;
        const next = typeof url === 'string' ? this.o.reconnectTo(url) : null;
        if (!next) { this.o.log('Twitch events: refused a reconnect address'); this.end?.({ kind: 'lost', welcomed: this.welcomed }); break; }
        this.o.log('Twitch events: Twitch asked for a reconnect');
        this.open(next, true); // the old socket stays until the new one says welcome
        break;
      }
      case 'revocation': {
        this.arm(ws);
        const sub = m.payload.subscription as { type?: unknown; status?: unknown } | undefined;
        const type = typeof sub?.type === 'string' ? sub.type : '';
        const why = typeof sub?.status === 'string' ? sub.status.slice(0, 60) : 'revoked';
        this.o.log(`Twitch events: Twitch revoked ${type || 'a subscription'} (${why})`);
        this.set({ why: 'subs', reason: `Twitch revoked ${type || 'a subscription'} (${why}).`, subs: this.state.subs.map(s => (s.type === type ? { type, status: 'revoked' as const, error: why } : s)) });
        this.recheckNow(); // an ended connection shows up as a 409 from the site
        break;
      }
      case 'notification': {
        this.arm(ws);
        const type = (m.payload.subscription as { type?: unknown } | undefined)?.type;
        if (typeof type !== 'string') break;
        if (type === CHAT_TYPE) { // only a command the site knows leaves the PC; no other chat is kept, forwarded or logged
          const word = chatWord(m.payload.event);
          if (!this.state.chat?.on || !word || !this.chatList.has(word)) break;
          this.o.log(`Twitch chat: command ${word} (${m.id})`);
        }
        this.state.lastEventAt = Date.now();
        this.enqueue({ messageId: m.id, type, event: m.payload.event ?? {}, tries: 0 });
        this.changed();
        break;
      }
      default:
        this.arm(ws);
    }
  }

  // ── token upkeep ──

  private scheduleRecheck(): void {
    if (this.recheckTimer) clearTimeout(this.recheckTimer);
    const t = this.token;
    const untilRenew = t && t.expiresAt > 0 ? t.expiresAt - Date.now() - this.o.refreshLeadMs : Infinity;
    this.recheckTimer = setTimeout(() => void this.recheck(), Math.max(1000, Math.min(this.o.recheckMs, untilRenew)));
    this.recheckTimer.unref?.();
  }

  /** Asks the site whether the channel is still connected; the answer carries a renewed token. A site that cannot answer is not a reason to hang up. */
  private async recheck(): Promise<void> {
    const a = await this.ask();
    if (!this.end) return;
    if (a.kind === 'ok') { this.adopt(a.token); this.changed(); this.scheduleRecheck(); }
    else if (a.kind === 'none' || a.kind === 'forbidden' || a.kind === 'ended') this.end({ kind: 'gone', why: a.kind });
    else this.scheduleRecheck();
  }

  private renew(): Promise<void> {
    this.refreshing ??= (async () => { const a = await this.ask(); if (a.kind === 'ok') this.adopt(a.token); })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  // ── Helix subscriptions, once per new session ──

  /** Fetches the chat command list. A failed fetch keeps the last list; 403/404 turns chat off. If chat flipped since this session subscribed, the session ends so the next one subscribes right. */
  private async refreshChat(watch = true): Promise<void> {
    try {
      const r = await this.client.chatCommands();
      if (!this.end) return;
      this.chatList = new Set(r.commands);
      this.state.chat = { on: r.chat, commands: r.commands.length };
      this.changed();
      if (watch && r.chat !== this.chatSubscribed) { this.o.log(`Twitch chat: ${r.chat ? 'now allowed' : 'no longer allowed'}, reconnecting`); this.end({ kind: 'lost', welcomed: true }); }
    } catch { this.o.log('Twitch chat: could not fetch the command list, keeping the last one'); }
  }

  private async subscribe(sessionId: string, ws: WebSocket): Promise<void> {
    await this.refreshChat(false); // this session has not subscribed yet, so a change now is simply what it subscribes to
    if (this.sock !== ws && this.pending !== ws) return;
    this.chatSubscribed = this.state.chat?.on === true;
    if (!this.chatTimer) { this.chatTimer = setInterval(() => void this.refreshChat(), this.o.chatMs); this.chatTimer.unref?.(); }
    const subs = await Promise.all((this.chatSubscribed ? [...SUBSCRIPTIONS, CHAT_SUBSCRIPTION] : SUBSCRIPTIONS).map(s => this.createSub(s, sessionId)));
    if (this.sock !== ws && this.pending !== ws) return;
    const failed = subs.filter(s => s.status === 'failed');
    this.o.log(`Twitch events: ${subs.length - failed.length} of ${subs.length} subscriptions on${failed.length ? `, failed: ${failed.map(f => `${f.type} (${f.error})`).join(', ')}` : ''}`);
    this.set({ subs, ...(failed.length ? { why: 'subs' as const, reason: `${failed.length} of ${subs.length} subscriptions failed: ${failed.map(f => `${f.type}: ${f.error}`).join('; ')}`.slice(0, 400) } : {}) });
  }

  private async createSub(spec: (typeof SUBSCRIPTIONS)[number], sessionId: string): Promise<EsSub> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (lastStatus === 401 || (this.token && this.token.expiresAt > 0 && this.token.expiresAt - Date.now() < 60_000)) await this.renew();
      const t = this.token;
      if (!t) return { type: spec.type, status: 'failed', error: 'no token' };
      let res: Response;
      try {
        res = await fetch(this.o.helixUrl, {
          method: 'POST',
          headers: { 'client-id': t.clientId, authorization: `Bearer ${t.accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(subscriptionBody(spec, t.userId, sessionId)),
          signal: AbortSignal.timeout(10_000),
        });
      } catch { return { type: spec.type, status: 'failed', error: 'Twitch did not answer' }; }
      lastStatus = res.status;
      if (res.status === 200 || res.status === 202) return { type: spec.type, status: 'enabled' };
      if (res.status === 401 && attempt === 0) continue; // renewed at the top of the next round
      if (res.status === 409 && attempt < 2) { await sleep(this.o.retryMs * 3, this.abort.signal); continue; } // the old session's copy is still going away
      return { type: spec.type, status: 'failed', error: failureText(res.status) };
    }
    return { type: spec.type, status: 'failed', error: failureText(lastStatus) };
  }

  // ── notifications to the site, in order, a few tries each ──

  private enqueue(item: { messageId: string; type: string; event: unknown; tries: number }): void {
    this.queue.push(item);
    if (this.queue.length > QUEUE_MAX) { this.queue.shift(); this.o.log('Twitch events: the site is slow, dropped the oldest event'); }
    if (!this.flushing) void this.flush();
  }

  private async flush(): Promise<void> {
    this.flushing = true;
    try {
      while (this.queue.length && !this.abort.signal.aborted) {
        const item = this.queue[0];
        try {
          const r = await this.client.twitchEvent({ messageId: item.messageId, type: item.type, event: item.event });
          if (r === 'refused') this.o.log(`Twitch events: the site refused ${item.type}`);
          this.queue.shift();
        } catch (e) {
          if (++item.tries >= 3 || e instanceof Unauthorized) { this.o.log(`Twitch events: could not give ${item.type} to the site`); this.queue.shift(); continue; }
          await sleep(this.o.retryMs, this.abort.signal);
        }
      }
    } finally { this.flushing = false; }
  }

  // ── the report that lets the Connection tab say "listening since ..." ──

  /** Sent when something changed and every reportMs while on. A PC that never listened (nothing connected, not allowed) stays silent. */
  private maybeReport(): void {
    const s = this.state;
    if (s.state === 'off' && (this.reported === null || this.reported === 'off')) return;
    const body = { type: 'twitch', state: s.state, reason: s.reason, login: s.login, testing: s.testing, since: s.since ?? 0, subs: s.subs.map(x => ({ type: x.type, status: x.status })) };
    const key = JSON.stringify(body);
    const now = Date.now();
    if (key === this.reportKey && (s.state === 'off' || now - this.reportAt < this.o.reportMs)) return;
    this.reportKey = key;
    this.reportAt = now;
    this.reported = s.state;
    void this.client.report(body).catch(() => { this.reportKey = ''; });
  }
}
