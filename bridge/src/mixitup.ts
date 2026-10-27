// Mix It Up's Developer API, V1 (github.com/MixItUpBot/Desktop: MixItUp.WPF/Services/DeveloperAPI/V1/*.cs, APIs/MixItUp.API/V1/Models/*.cs).
// It listens on http://localhost:8911 with no authentication and writes PascalCase JSON (PropertyNamingPolicy = null).
// The only address this file ever fetches is that one.
export const MIXITUP_URL = 'http://localhost:8911';

export interface MixItUpUser { id: string; twitchId: string; username: string; amounts: { id: string; name: string; amount: number }[] }

/** Nothing is listening on the port: Mix It Up is closed or its Developer API is off. */
export class MixItUpDown extends Error { constructor() { super('Mix It Up is not running'); } }
export class MixItUpError extends Error { constructor(readonly status: number, message: string) { super(message); } }

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export class MixItUpClient {
  private names = new Map<string, string>();

  constructor(private base: string = MIXITUP_URL, private timeoutMs = 4000) {}

  private async req(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') throw new MixItUpError(0, 'Mix It Up did not answer');
      throw new MixItUpDown();
    }
  }

  private async ok(method: string, path: string, body?: unknown): Promise<unknown> {
    const r = await this.req(method, path, body);
    if (r.status < 200 || r.status >= 300) {
      let message = `Mix It Up answered ${r.status}`;
      try { message = str((JSON.parse(r.text) as Json).Message) || message; } catch { /* not JSON */ }
      throw new MixItUpError(r.status, message);
    }
    try { return JSON.parse(r.text); } catch { return r.text; }
  }

  /** GET /api/status/version: a bare version string (plain text or a JSON string). Null when Mix It Up is not there. */
  async version(): Promise<string | null> {
    try {
      const r = await this.req('GET', '/api/status/version');
      if (r.status < 200 || r.status >= 300) throw new MixItUpError(r.status, `Mix It Up answered ${r.status}`);
      return r.text.trim().replace(/^"|"$/g, ''); // not parsed as JSON: "1.10" would become a number
    } catch (e) {
      if (e instanceof MixItUpDown) return null;
      throw e;
    }
  }

  /** GET /api/currency: [{ ID, Name }]. */
  async currencies(): Promise<{ id: string; name: string }[]> {
    const list = (await this.ok('GET', '/api/currency')) as Json[];
    const out = (Array.isArray(list) ? list : []).map(c => ({ id: str(c.ID), name: str(c.Name) })).filter(c => c.id && c.name);
    for (const c of out) this.names.set(c.id.toLowerCase(), c.name);
    return out;
  }

  /** GET /api/commands (CommandV1Controller): [{ ID, Name, IsEnabled, ... }]. Enabled commands only, at most 500, names cut at 100. */
  async commands(): Promise<{ id: string; name: string }[]> {
    const list = (await this.ok('GET', '/api/commands')) as Json[];
    return (Array.isArray(list) ? list : [])
      .filter(c => c.IsEnabled !== false)
      .map(c => ({ id: str(c.ID), name: str(c.Name).trim().slice(0, 100) }))
      .filter(c => c.id && c.name)
      .slice(0, 500);
  }

  /** POST /api/commands/{id} with a JSON array of strings (the command's arguments, $arg1text and so on). Mix It Up queues it and answers 200 at once. */
  async runCommand(id: string, args: string[]): Promise<void> {
    await this.ok('POST', `/api/commands/${encodeURIComponent(id)}`, args);
  }

  /** The name of a currency as last seen, for messages. */
  currencyName(id: string): string { return this.names.get(id.toLowerCase()) ?? 'currency'; }

  /** GET /api/users/twitch/{name}: User { ID, TwitchID, Username, CurrencyAmounts: [{ ID, Name, Amount }] }. Null when Mix It Up does not know the viewer (404). */
  async twitchUser(username: string): Promise<MixItUpUser | null> {
    try {
      return this.user(await this.ok('GET', `/api/users/twitch/${encodeURIComponent(username)}`) as Json);
    } catch (e) {
      if (e instanceof MixItUpError && e.status === 404) return null;
      throw e;
    }
  }

  private user(u: Json): MixItUpUser {
    const amounts = (Array.isArray(u.CurrencyAmounts) ? (u.CurrencyAmounts as Json[]) : []).map(a => ({ id: str(a.ID), name: str(a.Name), amount: typeof a.Amount === 'number' ? a.Amount : 0 }));
    for (const a of amounts) if (a.id && a.name) this.names.set(a.id.toLowerCase(), a.name);
    return { id: str(u.ID), twitchId: str(u.TwitchID), username: str(u.Username), amounts };
  }

  /** PUT /api/users/{ID}/currency/{currencyID}/adjust with { Amount }. The user is addressed by Mix It Up's own user ID: the route resolves a
   *  name on the streamer's default platform (UserV1Controller.AdjustUserCurrency), not necessarily Twitch. A negative amount that the
   *  viewer cannot cover is a 403 from Mix It Up. */
  async adjust(userId: string, currencyId: string, amount: number): Promise<void> {
    await this.ok('PUT', `/api/users/${encodeURIComponent(userId)}/currency/${encodeURIComponent(currencyId)}/adjust`, { Amount: amount });
  }

  /** GET /api/chat/users: User[] across platforms; keeps the Twitch ones (TwitchID set), lowercased. */
  async chatUsers(): Promise<string[]> {
    const list = (await this.ok('GET', '/api/chat/users')) as Json[];
    const names = (Array.isArray(list) ? list : []).filter(u => str(u.TwitchID)).map(u => str(u.Username).toLowerCase()).filter(Boolean);
    return [...new Set(names)];
  }

  /** POST /api/chat/message with { Message, SendAsStreamer: false }. */
  async say(text: string): Promise<void> {
    await this.ok('POST', '/api/chat/message', { Message: text, SendAsStreamer: false });
  }
}
