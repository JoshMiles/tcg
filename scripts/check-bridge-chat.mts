// Chat and Brie Bucks (ROADMAP 55.10): the start and end posts (wording, variables, off by default), the big pull shout (said on the reveal, never
// before), the backup and ledger jobs, and the Brie Bucks check (jobs one side has and the other lacks, or with another amount).
// Against the mock KV. Run: npx tsx scripts/check-bridge-chat.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const draw = await import('../lib/draw');
const m = await import('../lib/mixitup');
const mc = await import('../lib/mixitup-core');
const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
const c = await import('../lib/bridge-chat-core');
const chatLib = await import('../lib/bridge-chat');
const live = await import('../lib/twitch-live');
const r = await import('../lib/pull-rules-core');
const { getOverlayKey } = await import('../lib/overlay-key');
const { POST } = await import('../app/api/collection/route');
const { POST: heartbeat } = await import('../app/api/overlay/heartbeat/route');
const { POST: ledgerRoute } = await import('../app/api/bridge/ledger/route');
import type { PullRule } from '../lib/pull-rules-core';

const jobs = async () => kv.lrange<core.BridgeJob>('bridge:jobs', 0, -1);
const clearJobs = () => kv.del('bridge:jobs');
const settings = (chat: Partial<c.ChatSettings>, pullRules: PullRule[] = []) => m.saveMixItUpSettings({ ...mc.normalizeMixItUp(null), currencyId: 'cur1', pullRules, chat: c.normalizeChat(chat) });

// ── The pure part ──
const d = mc.normalizeMixItUp(null).chat;
ok(!d.startOn && !d.endOn && !d.backup && !d.check, 'every switch is off by default');
ok(d.startText === 'Packs are open: type !pack', 'the start post says packs are open');
ok(c.normalizeChat({ startOn: 'yes', startText: '   ' }).startOn === false && c.normalizeChat({ startText: '   ' }).startText === d.startText, 'only true switches on; blank text falls back to the default');
ok(c.normalizeChat({ endText: 'x'.repeat(999) }).endText.length === c.CHAT_LINE_MAX, 'a post is capped');
const recap = { rarest: { username: 'ann', cardName: 'Gouda Goat', stars: 4, packName: 'P', href: null }, topPullers: [{ username: 'ann', packs: 5 }, { username: 'bob', packs: 3 }, { username: 'cy', packs: 1 }] };
ok(c.endLine('Top: {topPull}. Most: {topPullers} on {channel} {nope}', recap, 'Chan') === 'Top: Gouda Goat by ann. Most: ann (5), bob (3), cy (1) on Chan {nope}', 'the end post fills its variables and leaves unknown ones');
ok(c.endLine('{topPull}', { rarest: null, topPullers: [] }, 'Chan') === 'none', 'no top pull reads "none"');
ok(r.shoutText('{viewer} got {card} ({rarity}) {edition}', { username: 'ann', cardName: 'Gouda Goat', stars: 4, variant: 'regular', isNew: false, serial: 7 }) === 'ann got Gouda Goat (Epic) #7', 'the shout fills viewer, card, rarity, edition');
ok(r.shoutText('{viewer} {edition}', { username: 'ann', cardName: 'x', stars: 1, variant: 'regular', isNew: false }) === 'ann', 'no copy number: {edition} is empty');
ok(r.normalizeRules([{ id: 'a', on: true, when: {}, commandId: '', say: 'hi {viewer}' }])[0]?.say === 'hi {viewer}', 'a rule may be only a chat line');

const site = [{ id: 'a', user: 'ann', amount: -100, at: 5 }, { id: 'b', user: 'bob', amount: -100, at: 6 }, { id: 'c', user: 'cy', amount: 100, at: 7 }];
const app = c.cleanLedger([{ id: 'a', user: 'ANN', amount: -100, at: 5, answer: 'ok' }, { id: 'b', user: 'bob', amount: -50, at: 6, answer: 'ok' }, { id: 'z', user: 'dee', amount: -100, at: 8, answer: 'timeout' }, { junk: true }, 'x']);
ok(app.length === 3 && app[0].user === 'ann', 'a posted ledger is cleaned (junk dropped, names lower case)');
const diff = c.compareLedgers(site, app);
ok(diff.length === 3 && /cy \+100.*no record/.test(diff.join('|')) && /bob.*-100.*-50/.test(diff.join('|')) && /dee -100.*timeout.*not in the site/.test(diff.join('|')), JSON.stringify(diff));
ok(c.compareLedgers(site, c.cleanLedger(site.map(s => ({ ...s, answer: 'ok' })))).length === 0, 'matching ledgers differ in nothing');

// ── Start and end of a stream ──
await kvLib.seedSeason1();
ok(!!(await b.pairBridge((await b.createPairCode('check')).code, 'Stream PC')), 'a bridge is paired');
await settings({});
await clearJobs();
await live.setLiveFromHint(true);
ok((await jobs()).length === 0, 'switches off: the stream starting posts nothing and backs nothing up');

await live.setLiveFromHint(false);
await settings({ startOn: true, endOn: true, backup: true, check: true });
await clearJobs();
await live.setLiveFromHint(true);
let q = await jobs();
ok(q.length === 2 && q.some(j => j.kind === 'say' && j.text === 'Packs are open: type !pack') && q.some(j => j.kind === 'backup' && j.phase === 'start' && j.currencyId === 'cur1'), 'the start: the post and the backup');
ok(q.every(j => core.isFreshJob(j, Date.now())), 'the bridge will claim them');
await live.setLiveFromHint(true);
ok((await jobs()).length === 2, 'seeing the same stream live again does nothing');

// a charge the site sends (nobody answers, so it gives up), and the shout on a big pull
b.tuning.waitMs = 40; b.tuning.pollMs = 10;
await b.callBridge({ currencyId: 'cur1' }, { action: 'deduct', username: 'Ann', amount: 100 });
await b.callBridge({ currencyId: 'cur1' }, { action: 'deduct', username: 'bob', amount: 100 });
const charges = (await jobs()).filter(j => j.kind === 'deduct');
ok(charges.length === 2 && (await b.readCharges()).length === 2 && (await b.readCharges())[0].amount === -100, 'the site keeps its own record of each charge');

await settings({ startOn: true, endOn: true, backup: true, check: true }, [{ id: 'big', on: true, when: {}, commandId: '', say: '{viewer} pulled {card} ({rarity})!' }]);
await clearJobs();
await draw.issueDraw('p1', 'ann');
const saved = await (await POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: 'ann', ticket: 'p1' }, revealInMs: 2500 }) }))).json() as { eventId: string };
ok((await jobs()).filter(j => j.kind === 'pull-event').length === 0, 'the save queues no chat line: the card is not shown yet');
const rev = await heartbeat(new NextRequest('http://localhost/api/overlay/heartbeat', { method: 'POST', body: JSON.stringify({ id: 'overlay-client-1', reveal: saved.eventId }), headers: { 'x-overlay-key': await getOverlayKey() } }));
ok(rev.status === 200, 'the overlay reports the reveal');
const shout = (await jobs()).find(j => j.kind === 'pull-event' && j.phase === 'reveal');
ok(!!shout?.text && /^ann pulled .+ \(.+\)!$/.test(shout.text) && !shout.text.includes('{'), 'on the reveal: the shout, with its variables filled: ' + shout?.text);

// the stream ends
await clearJobs();
await kv.del('twitch:recap:lock'); // the first end above took the 60 s lock
await live.setLiveFromHint(false);
q = await jobs();
const endSay = q.find(j => j.kind === 'say');
ok(!!endSay && /^Thanks for watching! Top pull: .+ by ann\. Most packs: ann \(1\)$/.test(endSay.text ?? ''), 'the end: the top pull and the top pullers: ' + endSay?.text);
ok(q.some(j => j.kind === 'backup' && j.phase === 'end') && q.some(j => j.kind === 'ledger'), 'the end: the backup and the ledger request');

// the app posts its ledger: bob's charge is missing there and an extra one is in it
const mine = (await b.readCharges())[0];
const post = (body: unknown, token?: string) => ledgerRoute(new Request('http://localhost/api/bridge/ledger', { method: 'POST', body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} }));
ok((await post({ entries: [] })).status === 401, 'the ledger route needs the bridge token');
const entries = [{ id: mine.id, user: 'ann', amount: -100, at: mine.at, answer: 'ok' }, { id: 'extra-1', user: 'dee', amount: -100, at: mine.at, answer: 'ok' }];
ok(await chatLib.receiveLedger(entries), 'the ledger is compared');
const res = await chatLib.readLedgerCheck();
ok(res && res.site === 2 && res.app === 2 && res.problems.length === 2 && res.problems.some(p => /^bob/.test(p)) && res.problems.some(p => /^dee/.test(p)), JSON.stringify(res));
ok((await m.getMixItUpLog()).some(e => e.what === 'check' && !e.ok), 'the check is in the log');
ok(!(await chatLib.receiveLedger(entries)), 'a second post compares nothing (one check per stream)');

await clearJobs();
console.log('chat and Brie Bucks checks passed');
