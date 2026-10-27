// TCG Bridge checks: a fake Mix It Up Developer API and a fake TCG site, both local HTTP servers, driven through the real service.
// Run from bridge/: npm run check   (or from the repo root: npx tsx bridge/scripts/check.ts). No Electron needed.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MixItUpClient } from '../src/mixitup';
import { BridgeService } from '../src/service';
import { FileSettingsStore } from '../src/settings';
import { cleanSite, pair, SiteClient, SiteError, type BridgeJob, type BridgeResult } from '../src/site';

const CUR = '11111111-2222-3333-4444-555555555555';
const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const TOKEN = 'tok-123';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
async function listen(handler: Handler): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => handler(req, res, body));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  return { server, url: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` };
}
const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const waitFor = async (what: string, cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
};

// ── Fake Mix It Up: PascalCase JSON like the real Developer API; the adjust route knows users by ID only ──
interface FakeUser { ID: string; TwitchID: string; Username: string; amount: number }
function fakeMixItUp() {
  const users = new Map<string, FakeUser>([['alice', { ID: ALICE, TwitchID: '77', Username: 'alice', amount: 10 }]]);
  const calls: { method: string; url: string; body: unknown }[] = [];
  const chat: { Message: string; SendAsStreamer: boolean }[] = [];
  const asUser = (u: FakeUser) => ({ ID: u.ID, TwitchID: u.TwitchID, Username: u.Username, CurrencyAmounts: [{ ID: CUR, Name: 'Brie Bucks', Amount: u.amount }], InventoryAmounts: [] });
  const handler: Handler = (req, res, body) => {
    const url = req.url ?? '';
    const json = body ? JSON.parse(body) : undefined;
    calls.push({ method: req.method ?? '', url, body: json });
    if (url === '/api/status/version') return send(res, 200, '1.10.0.0', 'text/plain');
    if (url === '/api/currency') return send(res, 200, [{ ID: CUR, Name: 'Brie Bucks' }]);
    const t = /^\/api\/users\/twitch\/([^/]+)$/.exec(url);
    if (t && req.method === 'GET') {
      const u = users.get(decodeURIComponent(t[1]));
      return u ? send(res, 200, asUser(u)) : send(res, 404, { Message: `Unable to find user: ${t[1]}.` });
    }
    const a = /^\/api\/users\/([^/]+)\/currency\/([^/]+)\/adjust$/.exec(url);
    if (a && req.method === 'PUT') {
      const u = [...users.values()].find(x => x.ID === a[1]);
      if (!u) return send(res, 404, { Message: 'Unable to find user' });
      if (a[2] !== CUR) return send(res, 404, { Message: 'Unable to find currency' });
      const n = (json as { Amount: number }).Amount;
      if (n < 0 && u.amount < -n) return send(res, 403, { Message: 'User does not have enough currency to remove' });
      u.amount += n;
      return send(res, 200, asUser(u));
    }
    if (url === '/api/chat/users') return send(res, 200, [asUser(users.get('alice')!), { ID: 'x', TwitchID: '', YouTubeID: 'yt', Username: 'YouTuber', CurrencyAmounts: [] }, { ...asUser(users.get('alice')!), Username: 'Alice' }]);
    if (url === '/api/chat/message' && req.method === 'POST') { chat.push(json); return send(res, 200, ''); }
    send(res, 404, { Message: 'no route' });
  };
  return { users, calls, chat, handler };
}

// ── Fake site: the bridge API from app/api/bridge/* ──
function fakeSite() {
  const s = {
    jobs: [] as BridgeJob[],
    hellos: [] as { version: string; currencies: { id: string; name: string }[] }[],
    results: [] as BridgeResult[],
    resultAttempts: 0,
    polls: 0,
    pollMode: 'ok' as 'ok' | '401' | '500',
    resultMode: (_r: BridgeResult, _attempt: number): 'ok' | 'late' | '500' | 'drop' => 'ok',
  };
  const handler: Handler = (req, res, body) => {
    const json = body ? JSON.parse(body) : {};
    if (req.url === '/api/bridge/pair') return json.code === 'ABCD-EFGH' ? send(res, 200, { token: TOKEN }) : send(res, 401, { error: 'That code is wrong or has expired.' });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'Unknown token' });
    if (req.url === '/api/bridge/hello') { s.hellos.push(json); return send(res, 200, { ok: true }); }
    if (req.url === '/api/bridge/poll') {
      s.polls++;
      if (s.pollMode === '401') return send(res, 401, { error: 'Unknown token' });
      if (s.pollMode === '500') return send(res, 500, { error: 'boom' });
      const jobs = s.jobs.splice(0);
      return jobs.length ? send(res, 200, { jobs }) : void setTimeout(() => send(res, 200, { jobs: [] }), 20); // a short "long-poll"
    }
    if (req.url === '/api/bridge/result') {
      const attempt = ++s.resultAttempts;
      const mode = s.resultMode(json, attempt);
      if (mode === 'drop') return void req.socket.destroy();
      if (mode === '500') return send(res, 500, { error: 'boom' });
      if (mode === 'late') return send(res, 409, { error: 'Too late', late: true });
      s.results.push(json);
      return send(res, 200, { ok: true });
    }
    send(res, 404, {});
  };
  return { s, handler };
}

const job = (kind: string, extra: Partial<BridgeJob> = {}): BridgeJob => ({ id: `j-${Math.random().toString(36).slice(2)}`, kind, currencyId: CUR, at: Date.now(), ...extra });

async function main() {
  const mi = fakeMixItUp();
  const miSrv = await listen(mi.handler);
  const si = fakeSite();
  const siSrv = await listen(si.handler);
  const mix = new MixItUpClient(miSrv.url, 1000);
  let changes = 0;
  const svc = new BridgeService({
    client: new SiteClient(siSrv.url, TOKEN, '0.0.0'), mix, onChange: () => { changes++; },
    mixCheckMs: 50, backoffMs: { min: 10, max: 40 }, retryMs: 5,
  });
  const resultOf = async (j: BridgeJob): Promise<BridgeResult> => {
    si.s.jobs.push(j);
    await waitFor(`result of ${j.kind}`, () => si.s.results.some(r => r.id === j.id));
    return si.s.results.find(r => r.id === j.id)!;
  };

  // pairing and the site address
  assert.equal(await pair(siSrv.url, 'ABCD-EFGH', 'STREAM-PC'), TOKEN);
  await assert.rejects(() => pair(siSrv.url, 'WRONG', 'x'), (e: unknown) => e instanceof SiteError && e.status === 401 && /wrong or has expired/.test(e.message));
  assert.equal(cleanSite('https://cheesytcg.app/admin'), 'https://cheesytcg.app');
  assert.equal(cleanSite('http://cheesytcg.app'), null);
  assert.equal(cleanSite('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(cleanSite('not a url'), null);

  svc.start();
  await waitFor('hello', () => si.s.hellos.length > 0);
  assert.deepEqual(si.s.hellos[0], { version: '1.10.0.0', currencies: [{ id: CUR, name: 'Brie Bucks' }] }); // the version stays a string
  await waitFor('connected', () => svc.state.site === 'connected' && svc.state.mix.found);
  assert.equal(svc.state.tray, 'connected');

  // each job kind
  assert.deepEqual(await resultOf(job('balance', { username: 'alice' })), { id: si.s.results.at(-1)!.id, ok: true, balance: 10 });
  assert.equal((await resultOf(job('balance', { username: 'nobody' }))).balance, 0, 'a viewer Mix It Up does not know has 0');
  const add = await resultOf(job('add', { username: 'Alice', amount: 5 }));
  assert.equal(add.ok, true);
  assert.equal(mi.users.get('alice')!.amount, 15);
  const adj = mi.calls.filter(c => c.method === 'PUT').at(-1)!;
  assert.equal(adj.url, `/api/users/${ALICE}/currency/${CUR}/adjust`, 'the adjust route is addressed by user ID');
  assert.deepEqual(adj.body, { Amount: 5 }, 'PascalCase body');
  const ded = await resultOf(job('deduct', { username: 'alice', amount: 3, text: 'alice opened a pack' }));
  assert.equal(ded.ok, true);
  assert.equal(mi.users.get('alice')!.amount, 12);
  assert.deepEqual(mi.calls.filter(c => c.method === 'PUT').at(-1)!.body, { Amount: -3 });
  await waitFor('deduct chat message', () => mi.chat.length === 1);
  assert.deepEqual(mi.chat[0], { Message: 'alice opened a pack', SendAsStreamer: false });
  const viewers = await resultOf(job('viewers'));
  assert.deepEqual(viewers.users, ['alice'], 'Twitch viewers only, lowercased, no duplicates');
  const say = await resultOf(job('say', { text: 'hello chat' }));
  assert.equal(say.ok, true);
  assert.deepEqual(mi.chat[1], { Message: 'hello chat', SendAsStreamer: false });

  // deduct refused when short: never negative, no adjust sent
  const puts = () => mi.calls.filter(c => c.method === 'PUT').length;
  const before = puts();
  const short = await resultOf(job('deduct', { username: 'alice', amount: 999 }));
  assert.deepEqual([short.ok, short.error], [false, 'Not enough Brie Bucks']);
  const stranger = await resultOf(job('deduct', { username: 'nobody', amount: 1 }));
  assert.deepEqual([stranger.ok, stranger.error], [false, 'Not enough Brie Bucks']);
  assert.equal(puts(), before, 'a short deduct never reaches the adjust route');
  assert.equal(mi.users.get('alice')!.amount, 12);

  // bad jobs are refused, unknown kinds are ignored
  assert.equal((await resultOf(job('add', { username: 'a/../b', amount: 1 }))).ok, false);
  assert.equal((await resultOf(job('add', { username: 'alice', amount: -4 }))).ok, false);
  assert.equal((await resultOf(job('add', { username: 'alice', amount: 1, currencyId: 'not-a-guid' }))).ok, false);
  const weird = job('format-disk', { username: 'alice' });
  si.s.jobs.push(weird);
  await resultOf(job('balance', { username: 'alice' }));
  assert.ok(!si.s.results.some(r => r.id === weird.id), 'an unknown kind gets no result');
  assert.ok(!mi.calls.some(c => c.url.includes('format')), 'and touches nothing');

  // the result is retried (500 twice, then a dropped connection) and arrives once
  const retried = job('balance', { username: 'alice' });
  si.s.resultAttempts = 0;
  si.s.resultMode = (r, attempt) => (r.id === retried.id ? (attempt === 1 || attempt === 2 ? '500' : attempt === 3 ? 'drop' : 'ok') : 'ok');
  assert.equal((await resultOf(retried)).balance, 12);
  assert.equal(si.s.resultAttempts, 4, '3 retries after the first try');
  si.s.resultMode = () => 'ok';

  // a late result: deduct is given back, add is taken back, balance needs nothing
  const lateDeduct = job('deduct', { username: 'alice', amount: 4 });
  si.s.resultMode = r => (r.id === lateDeduct.id ? 'late' : 'ok');
  si.s.jobs.push(lateDeduct);
  await waitFor('deduct undone', () => svc.state.jobs.some(j => /deduct was given back/.test(j.detail)));
  assert.equal(mi.users.get('alice')!.amount, 12, 'deduct then add back');
  assert.equal(mi.chat.length, 2, 'no chat message for a deduct the site refused');
  const lateAdd = job('add', { username: 'alice', amount: 6 });
  si.s.resultMode = r => (r.id === lateAdd.id ? 'late' : 'ok');
  si.s.jobs.push(lateAdd);
  await waitFor('add undone', () => svc.state.jobs.some(j => /add was taken back/.test(j.detail)));
  assert.equal(mi.users.get('alice')!.amount, 12, 'add then take back');
  const lateBalance = job('balance', { username: 'alice' });
  si.s.resultMode = r => (r.id === lateBalance.id ? 'late' : 'ok');
  const putsBefore = puts();
  si.s.jobs.push(lateBalance);
  await waitFor('late balance seen', () => svc.state.jobs.some(j => j.kind === 'balance' && /^Late/.test(j.detail)));
  assert.equal(puts(), putsBefore, 'a late balance changes nothing');
  si.s.resultMode = () => 'ok';
  assert.ok(svc.state.jobs.length <= 50);
  assert.equal(svc.state.currency, 'Brie Bucks');

  // the site goes away and comes back: the loop backs off and reconnects
  si.s.pollMode = '500';
  await waitFor('offline', () => svc.state.site === 'offline' && svc.state.tray === 'partly');
  si.s.pollMode = 'ok';
  await waitFor('reconnected', () => svc.state.site === 'connected');

  // Mix It Up goes away: the job is answered at once, and it says hello again when it returns
  await new Promise<void>(r => miSrv.server.close(() => r()));
  const t0 = Date.now();
  const down = await resultOf(job('balance', { username: 'alice' }));
  assert.deepEqual([down.ok, down.error], [false, 'Mix It Up is not running']);
  assert.ok(Date.now() - t0 < 1000, 'answered at once, not after a timeout');
  await waitFor('mix lost', () => !svc.state.mix.found && svc.state.tray === 'partly');
  const hellosBefore = si.s.hellos.length;
  await new Promise<void>(r => miSrv.server.listen(Number(new URL(miSrv.url).port), '127.0.0.1', r));
  await waitFor('hello after Mix It Up returns', () => si.s.hellos.length > hellosBefore);

  // a revoked token: the loop stops and says "Pair again"
  si.s.pollMode = '401';
  await waitFor('revoked', () => svc.state.site === 'revoked');
  assert.equal(svc.state.siteError, 'Pair again');
  await svc.stop();
  const polls = si.s.polls;
  await new Promise(r => setTimeout(r, 150));
  assert.equal(si.s.polls, polls, 'no polling after a 401');
  assert.ok(changes > 0);

  // settings: the token is never written in plain text
  const dir = mkdtempSync(join(tmpdir(), 'tcg-bridge-'));
  const cipher = { encrypt: async (s: string) => Buffer.from(s.split('').reverse().join('')), decrypt: async (b: Buffer) => b.toString().split('').reverse().join('') };
  const store = new FileSettingsStore(dir, cipher);
  assert.equal((await store.load()).site, 'https://cheesytcg.app');
  assert.equal((await store.load()).startWithWindows, true);
  await store.save({ site: 'https://example.test', token: 'secret-token', pairedAs: 'PC', startWithWindows: false });
  assert.ok(!readFileSync(join(dir, 'settings.json'), 'utf8').includes('secret-token'));
  assert.deepEqual(await store.load(), { site: 'https://example.test', token: 'secret-token', pairedAs: 'PC', startWithWindows: false });
  rmSync(dir, { recursive: true, force: true });

  miSrv.server.close();
  siSrv.server.close();
  console.log('TCG Bridge checks passed');
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
