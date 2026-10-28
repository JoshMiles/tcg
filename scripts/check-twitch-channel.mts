// Connect the Twitch channel (ROADMAP 58.1): the token refresh (success, a rotated token, a rejection, a Twitch outage), the callback's state check,
// storing only an encrypted refresh token, a rejected refresh ending the connection with a staff notice and an audit line, the bridge token route
// (admin PCs only, rate limited, no-store) and Disconnect. Against the mock KV (node scripts/mock-kv.cjs) and a faked Twitch: no real Twitch.
// Run: npx tsx scripts/check-twitch-channel.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
process.env.BACKUP_ENCRYPTION_KEY = 'a-backup-key-that-is-long-enough';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// Twitch is faked; the mock KV (same fetch) passes through.
const realFetch = globalThis.fetch;
let twitch: { token: (b: URLSearchParams) => { status: number; body?: unknown }; users: { id: string; login: string } } = { token: () => ({ status: 500 }), users: { id: '1', login: 'x' } };
const seen: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u.startsWith(url)) return realFetch(input, init);
  const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
  if (u.endsWith('/oauth2/token')) { seen.push('token:' + body.get('grant_type')); const r = twitch.token(body); return new Response(JSON.stringify(r.body ?? {}), { status: r.status }); }
  if (u.endsWith('/oauth2/revoke')) { seen.push('revoke'); return new Response('', { status: 200 }); }
  if (u.endsWith('/helix/users')) { seen.push('users'); return new Response(JSON.stringify({ data: [twitch.users] }), { status: 200 }); }
  throw new Error('unexpected request to ' + u);
}) as typeof fetch;

const core = await import('../lib/twitch-channel-core');
const ch = await import('../lib/twitch-channel');
const b = await import('../lib/bridge');
const { kv } = await import('../lib/db');
const route = await import('../app/api/bridge/twitch-token/route');

const SCOPES = [...core.CHANNEL_SCOPES];
const good = (extra: object = {}) => ({ status: 200, body: { access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', expires_in: 14000, scope: SCOPES, ...extra } });
const creds = { clientId: 'c', clientSecret: 's' };

// ── The pure refresh helper ──
const stub = (status: number, body?: unknown): typeof fetch => (async () => new Response(JSON.stringify(body ?? {}), { status })) as typeof fetch;
const now = 1_000_000;
const r1 = await core.refreshAccessToken('old', creds, 'https://id.example', stub(200, { access_token: 'a', refresh_token: 'new', expires_in: 3600, scope: SCOPES }), now);
ok(r1.ok && r1.accessToken === 'a' && r1.refreshToken === 'new' && r1.expiresAt === now + (3600 - core.EXPIRY_MARGIN_S) * 1000, 'a refresh returns the access token, the new refresh token and an expiry a minute early');
const r2 = await core.refreshAccessToken('old', creds, 'https://id.example', stub(200, { access_token: 'a', expires_in: 3600 }), now);
ok(r2.ok && r2.refreshToken === 'old', 'no new refresh token from Twitch keeps the old one');
for (const s of [400, 401]) { const r = await core.refreshAccessToken('old', creds, 'https://id.example', stub(s), now); ok(!r.ok && r.rejected, `a ${s} is a rejection`); }
for (const s of [500, 503, 429]) { const r = await core.refreshAccessToken('old', creds, 'https://id.example', stub(s), now); ok(!r.ok && !r.rejected, `a ${s} is not a rejection`); }
const boom = await core.refreshAccessToken('old', creds, 'https://id.example', (async () => { throw new Error('offline'); }) as typeof fetch, now);
ok(!boom.ok && !boom.rejected, 'a network error is not a rejection');
const junk = await core.refreshAccessToken('old', creds, 'https://id.example', stub(200, { nope: true }), now);
ok(!junk.ok && !junk.rejected, 'a 200 without a token is not a rejection');

// ── The callback's state check ──
const cookie = JSON.stringify({ state: 'abc123', channel: true, by: 'josh', returnTo: '/admin/mixitup' });
ok(ch.channelStateOk(cookie, 'abc123', 'josh'), 'the matching state for the same admin passes');
ok(!ch.channelStateOk(cookie, 'abc124', 'josh') && !ch.channelStateOk(cookie, 'abc12', 'josh') && !ch.channelStateOk(cookie, null, 'josh'), 'a different, short or missing state fails');
ok(!ch.channelStateOk(cookie, 'abc123', 'someone-else'), 'another admin cannot finish it');
ok(!ch.channelStateOk(JSON.stringify({ state: 'abc123', by: 'josh' }), 'abc123', 'josh'), 'a plain sign-in cookie is not a channel connection');
ok(!ch.channelStateOk(undefined, 'abc123', 'josh') && !ch.channelStateOk('not json', 'abc123', 'josh'), 'no cookie or a broken one fails');

// ── Connecting stores an encrypted refresh token and nothing else secret ──
ok((await ch.readChannelStatus()) === null, 'nothing connected at first');
twitch = { token: () => good(), users: { id: '4242', login: 'SpareAccount' } };
const c1 = await ch.connectChannel('code', 'josh');
ok(c1.ok && c1.login === 'spareaccount', 'connecting works for any account');
const raw = JSON.stringify(await kv.get(core.CHANNEL_AUTH_KEY));
ok(!raw.includes('REFRESH-1') && !raw.includes('ACCESS-1') && !raw.includes('test-secret'), 'no token is stored in the clear, and no access token at all');
const st = await ch.readChannelStatus();
ok(st?.login === 'spareaccount' && st.userId === '4242' && st.by === 'josh' && st.testing && SCOPES.every(s => st.scopes.includes(s)), 'status says who, the scopes, by whom, and that it is a test account');
ok(!JSON.stringify(st).includes('refresh'), 'the status carries no token');
ok(core.testingLine('spareaccount') === 'Testing on spareaccount, not the live channel', 'the testing line');
const audit1 = JSON.stringify(await kv.lrange('audit:all', 0, -1));
ok(audit1.includes('Twitch channel connected') && !audit1.includes('REFRESH-1') && !audit1.includes('ACCESS-1'), 'an audit line for connect, without a token');

// A grant missing a scope is refused and revoked, and the old connection stays
seen.length = 0;
twitch = { token: () => good({ scope: ['bits:read'] }), users: { id: '9', login: 'other' } };
const c2 = await ch.connectChannel('code', 'josh');
ok(!c2.ok && c2.reason === 'scopes' && seen.includes('revoke') && (await ch.readChannelStatus())?.login === 'spareaccount', 'a missing scope is refused, revoked, and changes nothing');
twitch = { token: () => ({ status: 400 }), users: { id: '9', login: 'other' } };
ok(!(await ch.connectChannel('bad', 'josh')).ok, 'a failed code exchange connects nothing');

// The live channel is not flagged as a test
twitch = { token: () => good(), users: { id: '77', login: 'Cheesygidds' } };
await ch.connectChannel('code', 'josh');
ok((await ch.readChannelStatus())?.testing === false, 'the live channel is not "testing"');
twitch = { token: () => good(), users: { id: '4242', login: 'SpareAccount' } };
await ch.connectChannel('code', 'josh');

// ── Access tokens: a refresh, a rotated refresh token, a busy lock ──
twitch = { token: () => good({ access_token: 'ACCESS-2', refresh_token: 'REFRESH-2' }), users: twitch.users };
const t1 = await ch.channelAccessToken();
ok(t1.ok && t1.accessToken === 'ACCESS-2' && t1.userId === '4242' && t1.expiresAt > Date.now(), 'a fresh access token and its expiry');
ok(!JSON.stringify(await kv.get(core.CHANNEL_AUTH_KEY)).includes('ACCESS-2'), 'the access token is not stored');
let sent: string | null = null;
twitch = { token: b2 => { sent = b2.get('refresh_token'); return good({ access_token: 'ACCESS-3' }); }, users: twitch.users };
await ch.channelAccessToken();
ok(sent === 'REFRESH-2', 'the rotated refresh token was saved and is the one used next');
await kv.set('twitch:channel-auth:refresh', 1, { ex: 15 });
const busy = await ch.channelAccessToken();
ok(!busy.ok && busy.error === 'busy', 'a refresh already running answers busy');
await kv.del('twitch:channel-auth:refresh');

// A Twitch outage keeps the connection
twitch = { token: () => ({ status: 503 }), users: twitch.users };
const out = await ch.channelAccessToken();
ok(!out.ok && out.error === 'unavailable' && !!(await ch.readChannelStatus()), 'an outage is not a disconnect');

// ── The bridge route ──
const admin = await b.mintToken('Admin PC', { userId: '1', login: 'josh', role: 'admin', by: 'josh', roleCheckedAt: Date.now() });
const mod = await b.mintToken('Mod PC', { userId: '2', login: 'modder', role: 'mod', by: 'modder', roleCheckedAt: Date.now() });
const oldOff = await b.mintToken('Old PC', { by: 'josh' });
const call = (token?: string) => route.POST(new Request('http://localhost/api/bridge/twitch-token', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} }));
twitch = { token: () => good({ access_token: 'ACCESS-9', refresh_token: 'REFRESH-9' }), users: twitch.users };
ok((await call()).status === 401, 'no token is refused');
const rm = await call(mod);
ok(rm.status === 403 && /admin/.test(((await rm.json()) as { error: string }).error), 'a mod-linked PC is refused with the staff message');
ok((await call(oldOff)).status === 403, 'an old paired PC with the staff switch off is refused');
const ra = await call(admin);
const bodyA = (await ra.json()) as { accessToken: string; expiresAt: number; userId: string; login: string };
ok(ra.status === 200 && bodyA.accessToken === 'ACCESS-9' && bodyA.expiresAt > Date.now() && bodyA.userId === '4242' && ra.headers.get('cache-control') === 'no-store', 'an admin PC gets a token, an expiry and no-store');
ok(!JSON.stringify(bodyA).includes('REFRESH'), 'the refresh token never leaves the site');
let last = 200;
for (let i = 0; i < 40 && last !== 429; i++) last = (await call(admin)).status;
ok(last === 429, 'the route rate limits one PC');

// ── A rejected refresh ends the connection: key gone, audit line, staff notice ──
await kv.del('rl:bridge-twitch-token:' + (await import('../lib/bridge-core')).hashToken(admin));
twitch = { token: () => ({ status: 400 }), users: twitch.users };
const dead = await call(admin);
ok(dead.status === 409, 'the route says Twitch ended the connection');
ok((await ch.readChannelStatus()) === null && (await kv.get(core.CHANNEL_AUTH_KEY)) === null, 'a rejected refresh deletes the stored connection');
ok(JSON.stringify(await kv.lrange('audit:all', 0, -1)).includes('Twitch rejected the token'), 'an audit line for the rejection');
const notices = await kv.lrange(`bridge:notices:${(await b.listBridges()).find(p => p.name === 'Admin PC')!.id}`, 0, -1);
ok(JSON.stringify(notices).includes('Twitch channel disconnected'), 'the staff PCs get a notice');
const none = await call(admin);
ok(none.status === 404, 'with nothing connected the route says so');

// ── Disconnect ──
twitch = { token: () => good(), users: { id: '4242', login: 'SpareAccount' } };
await ch.connectChannel('code', 'josh');
ok(!!(await kv.get(core.CHANNEL_AUTH_KEY)), 'connected again');
seen.length = 0;
ok((await ch.disconnectChannel()) === 'spareaccount', 'Disconnect says whom it disconnected');
ok((await kv.get(core.CHANNEL_AUTH_KEY)) === null && seen.includes('revoke'), 'Disconnect revokes at Twitch and deletes the key');
ok(JSON.stringify(await kv.lrange('audit:all', 0, -1)).includes('"Twitch channel disconnected"'), 'an audit line for the disconnect');
ok((await ch.disconnectChannel()) === null, 'disconnecting nothing does nothing');

globalThis.fetch = realFetch;
console.log('check-twitch-channel: ok');
process.exit(0);
