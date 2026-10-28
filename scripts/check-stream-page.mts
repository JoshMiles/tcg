// The Stream page (ROADMAP 63.2): where every old Mix It Up tab id lands, the status strip, the live feed (merge and filter) and the awards pause
// that the Live section and TCG Bridge share. Uses the mock KV like the other checks (the runner sets KV_REST_API_URL).
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const s = await import('../lib/stream-page');
const { kv } = await import('../lib/db');
const { awardsPaused, pauseAwards } = await import('../lib/twitch-awards');
type Card = import('../lib/mixitup-page').StatusCard;

// ── Every old tab id has a section; none has a sub-tab ──
const OLD_TABS = ['overview', 'connection', 'paid', 'bigpulls', 'chat', 'commands', 'streamdeck', 'events', 'log'];
for (const t of OLD_TABS) {
  ok(Object.hasOwn(s.OLD_TAB_SECTION, t), `old tab ${t} has a section`);
  const r = s.resolveStream(undefined, t);
  ok(s.SECTIONS.some(x => x.id === r.section), `old tab ${t} lands in a real section`);
  ok(!('tab' in r), `old tab ${t} gives no sub-tab`);
  if (r.section === 'viewers') ok(r.card !== null, `old tab ${t} opens a card`);
  else if (t === 'connection') ok(r.conn === null, 'the old connection tab is the Connections section');
}
ok(s.resolveStream(undefined, 'overview').section === 'live', 'Overview is now Live');
ok(s.resolveStream(undefined, 'paid').section === 'viewers' && s.resolveStream(undefined, 'events').section === 'viewers', 'viewer tabs are under What viewers get');
ok(s.resolveStream(undefined, 'connection').section === 'connections' && s.resolveStream(undefined, 'log').section === 'history', 'connection and log have their sections');
ok(s.resolveStream(undefined, undefined).section === 'live' && s.resolveStream('nope', 'nope').section === 'live', 'no or unknown params is Live');
ok(s.resolveStream(undefined, 'log').section === 'history', '?tab=log lands on History');
ok(!('tab' in s.resolveStream('history', 'log')) && !('SUB_TABS' in s), 'there are no sub-tabs');
ok(s.resolveStream('viewers', undefined).card === null && s.resolveStream('live', undefined).card === null, 'the card grid has no card open, and other sections have none');
ok(s.resolveStream('__proto__', '__proto__').section === 'live', 'a prototype name is not a section');
ok(s.legacyStreamHref({ tab: 'log', filter: 'refused', note: 'hi' }) === '/admin/stream?section=history&note=hi&filter=refused', '?tab=log redirects to History and keeps note and filter');
ok(s.legacyStreamHref({}) === '/admin/stream?section=live', 'the redirect with nothing is Live');
ok(s.legacyStreamHref({ tab: 'commands', saved: 'mixitup', error: 'x y' }).startsWith('/admin/stream?section=viewers&card=commands&error=x+y&saved=mixitup'), 'the redirect keeps saved and error');

// ── Connections (63.4): old ids and anchors, the list, the default, the first-run rule, wizard addresses ──
const cn = await import('../lib/stream-connections');
const wz = await import('../lib/mixitup-wizard');
ok(s.legacyStreamHref({ tab: 'connection' }) === '/admin/stream?section=connections', '?tab=connection lands on Connections');
ok(s.legacyStreamHref({ tab: 'connection', conn: 'twitch', error: 'x' }) === '/admin/stream?section=connections&conn=twitch&error=x', 'a conn is kept, with error');
ok(s.legacyStreamHref({ tab: 'connection', conn: 'nope' }) === '/admin/stream?section=connections', 'an unknown conn is dropped');
ok(s.resolveStream('connections', undefined, undefined, 'obs').conn === 'obs' && s.resolveStream('live', undefined, undefined, 'obs').conn === null, 'conn is read only in Connections');
ok(cn.connForAnchor('#bridge-errors') === 'errors' && cn.connForAnchor('bridge-errors') === 'errors' && cn.connForAnchor('#x') === null && cn.connForAnchor('__proto__') === null, '#bridge-errors is the errors connection');
ok(cn.CONNS.map(c => c.id).join() === 'bridge,mixitup,obs,twitch,command,errors', 'the six connections in order');
ok(cn.connHref('errors') === '/admin/stream?section=connections&conn=errors', 'a connection address');
ok(cn.pickConn('twitch') === 'twitch' && cn.pickConn('constructor') === null && cn.pickConn(undefined) === null, 'pickConn');
const mk = (id: Card['id'], tone: Card['tone'], state = `state ${id}`): Card => ({ id, title: `T ${id}`, tone, state, rows: [] });
const green = [mk('incoming', 'ok'), mk('outgoing', 'ok'), mk('obs', 'ok')];
const cmdRow = (found: boolean) => ({ found }) as import('../lib/mixitup-command-check-core').CommandCheckRow;
const base = { cards: green, connection: 'bridge' as const, paired: 2, twitch: { login: 'a', listening: true, chat: true }, commandCheck: [cmdRow(true)], errors24h: 0 };
let list = cn.connectionList(base);
ok(list.length === 6 && list.every(c => c.tone === 'ok' && c.state.length > 0), 'all good: six green items, each with a state line');
ok(list[0].state === '2 PCs linked' && cn.connectionList({ ...base, paired: 1 })[0].state === '1 PC linked', 'TCG Bridge counts PCs');
ok(cn.defaultConn(list) === 'bridge', 'nothing needs attention: TCG Bridge opens');
list = cn.connectionList({ ...base, paired: 0, cards: [mk('incoming', 'muted'), mk('outgoing', 'bad', 'not paired'), mk('obs', 'muted')], twitch: null, commandCheck: null });
ok(list[0].tone === 'bad' && list[0].state === 'No PC linked yet' && list[3].tone === 'muted' && list[3].state === 'Not connected' && list[4].tone === 'muted', 'nothing connected: bridge red, others waiting');
list = cn.connectionList({ ...base, cards: [mk('incoming', 'ok'), mk('outgoing', 'warn', 'Choose the currency'), mk('obs', 'ok')] });
ok(list[0].tone === 'warn' && list[0].state === 'Choose the currency', 'the site-to-Mix-It-Up status folds into TCG Bridge');
list = cn.connectionList({ ...base, cards: [mk('incoming', 'warn', 'wrong secret'), mk('outgoing', 'ok'), mk('obs', 'warn', 'Overlay hidden')] });
ok(list[1].tone === 'warn' && list[1].state === 'wrong secret' && list[2].state === 'Overlay hidden', 'Mix It Up to the site folds into Mix It Up; OBS shows its card');
ok(cn.defaultConn(list) === 'mixitup', 'the first connection that needs attention opens');
list = cn.connectionList({ ...base, connection: 'addresses', paired: 0, cards: [mk('incoming', 'ok'), mk('outgoing', 'ok'), mk('obs', 'muted')] });
ok(list[0].tone === 'muted' && list[1].state === 'Direct addresses working', 'direct addresses: bridge not used, Mix It Up shows the addresses');
list = cn.connectionList({ ...base, twitch: { login: 'a', listening: false, chat: true }, commandCheck: [cmdRow(false), cmdRow(true), cmdRow(false)], errors24h: 3 });
ok(list[3].tone === 'warn' && list[3].state === 'TCG Bridge is not listening' && list[4].state === '2 missing' && list[5].state === '3 in 24 h' && cn.defaultConn(list) === 'twitch', 'twitch, command check and errors states');
ok(cn.connectionList({ ...base, twitch: { login: 'a', listening: true, chat: false } })[3].state === 'Reconnect to allow chat', 'chat permission missing');
ok(Object.keys(cn.TONE_WORD).length === 4 && Object.values(cn.TONE_WORD).every(w => w.length > 0), 'every dot has a text equivalent');
ok(wz.setupHref() === '/admin/stream?section=setup' && wz.setupHref('rules') === '/admin/stream?section=setup&step=rules', 'wizard step addresses');
ok(wz.legacySetupHref({ step: 'outgoing', note: 'Saved.', error: 'x y', extra: 'z' }) === '/admin/stream?section=setup&step=outgoing&note=Saved.&error=x+y', 'the old setup address keeps step, note and error');
ok(wz.legacySetupHref({}) === '/admin/stream?section=setup', 'the old setup address with nothing');

// ── Status strip ──
const card = (id: Card['id'], tone: Card['tone'], extra: Partial<Card> = {}): Card => ({ id, title: `T ${id}`, tone, state: `state ${id}`, rows: [], ...extra });
const now = 1_800_000_000_000;
let strip = s.statusStrip([card('incoming', 'ok'), card('outgoing', 'ok'), card('obs', 'ok')], null, now);
ok(strip.ok && strip.title === 'All good' && strip.items.length === 0, 'all green is All good');
strip = s.statusStrip([card('incoming', 'muted'), card('outgoing', 'ok'), card('obs', 'ok')], null, now);
ok(strip.ok, 'a waiting card with nothing to do is not a problem');
strip = s.statusStrip([card('incoming', 'warn', { fix: { href: '/admin/stream?tab=commands', label: 'Open Commands' } }), card('outgoing', 'ok'), card('obs', 'ok')], null, now);
ok(!strip.ok && strip.title === '1 thing needs you' && strip.items[0].fix.href === '/admin/stream?tab=commands' && strip.items[0].line === 'T incoming: state incoming', 'one warning is "1 thing needs you" with its own fix link');
strip = s.statusStrip([card('incoming', 'bad'), card('outgoing', 'muted', { todo: 'Set it up' }), card('obs', 'ok')], null, now);
ok(strip.title === '2 things need you' && strip.items.length === 2, 'two items are "2 things need you"');
ok(strip.items.every(i => i.fix.href.length > 0 && i.fix.label.length > 0), 'every item has a fix link (a default when the card has none)');
strip = s.statusStrip([card('incoming', 'ok'), card('outgoing', 'ok'), card('obs', 'bad')], null, now);
ok(strip.items[0].fix.href.endsWith('conn=obs'), 'an OBS problem with no fix of its own opens OBS in Connections');
const bad = { label: 'OBS', tone: 'bad' as const, text: 'not connected' };
const recent = { at: now - 3600_000, ready: false, lines: [bad, { label: 'Mix It Up', tone: 'ok' as const, text: 'fine' }] };
strip = s.statusStrip([card('incoming', 'ok'), card('outgoing', 'ok'), card('obs', 'ok')], recent, now);
ok(!strip.ok && strip.items.length === 1 && strip.items[0].line.includes('OBS'), 'a recent red checklist line is an item');
strip = s.statusStrip([card('incoming', 'ok'), card('outgoing', 'ok'), card('obs', 'ok')], { ...recent, at: now - s.CHECKLIST_FRESH_MS - 1 }, now);
ok(strip.ok, 'an old checklist is ignored');

// ── The feed: merge, dedupe, filter ──
const L = (at: number, username: string, what: import('../lib/mixitup').MixItUpLogEntry['what'], okk = true, detail = what): import('../lib/mixitup').MixItUpLogEntry => ({ at, username, what, ok: okk, detail });
const log = [L(100, 'ann', 'pull'), L(90, 'bob', 'refused', false, 'paused'), L(80, 'cat', 'buff'), L(70, 'dan', 'balance')];
const cmd = [L(95, 'eve', 'command')];
const events = [{ at: 80, username: 'cat', ok: true, detail: 'buff', event: 'sub' }, { at: 60, username: 'fay', ok: false, detail: 'raid failed', event: 'raid' }];
const feed = s.mergeFeed(log, cmd, events);
ok(feed.map(f => f.at).join() === '100,95,90,80,70,60', 'newest first, and the event reward written to both lists appears once');
ok(feed.filter(f => f.who === 'cat').length === 1 && feed.find(f => f.who === 'cat')!.tag === 'sub', 'the duplicate keeps the event feed line');
ok(s.filterFeed(feed, 'all').length === 6, 'all keeps everything');
ok(s.filterFeed(feed, 'pulls').map(f => f.who).join() === 'ann', 'pulls: only pulls and grants');
ok(s.filterFeed(feed, 'requests').map(f => f.who).join() === 'eve,dan', 'requests: commands and the rest');
ok(s.filterFeed(feed, 'events').map(f => f.who).join() === 'cat', 'events: event rewards');
ok(s.filterFeed(feed, 'problems').map(f => f.who).join() === 'bob,fay', 'problems: refused lines and failed events');
ok(s.mergeFeed(log, cmd, events, 2).length === 2, 'the limit applies after the merge');
ok(s.mergeFeed([], [], []).length === 0, 'empty is empty');
ok(s.pickFeedFilter('problems') === 'problems' && s.pickFeedFilter('x') === 'all' && s.pickFeedFilter(undefined) === 'all', 'the feed filter falls back to all');

// ── The awards pause (shared with TCG Bridge's pause-awards): changes the key, audits once per change ──
await kv.del('twitch:awards-paused'); await kv.del('audit:all');
const audits = async () => ((await kv.lrange<{ action: string }>('audit:all', 0, 20)) ?? []).filter(a => /channel point awards/.test(a.action));
ok(!(await awardsPaused()), 'awards start on');
ok((await pauseAwards(true, 'josh on the Stream page')) === true && (await awardsPaused()) && !!(await kv.get('twitch:awards-paused')), 'pausing sets twitch:awards-paused');
ok((await audits()).length === 1 && (await audits())[0].action === 'josh on the Stream page: channel point awards paused', 'one audit line for the change');
ok((await pauseAwards(true, 'josh on the Stream page')) === false && (await audits()).length === 1, 'pausing again changes nothing and adds no audit line');
ok((await pauseAwards(false, 'TCG Bridge')) === true && !(await awardsPaused()) && (await kv.get('twitch:awards-paused')) == null, 'resuming clears the key');
ok((await audits()).length === 2 && (await audits())[0].action === 'TCG Bridge: channel point awards resumed', 'one more audit line for the resume, in the same words as the bridge');
ok((await pauseAwards(false, 'TCG Bridge')) === false && (await audits()).length === 2, 'resuming again adds nothing');

console.log('check-stream-page: ok');
