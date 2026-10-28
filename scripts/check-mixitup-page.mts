// The Mix It Up page's pure parts (ROADMAP 55.7): the Overview's status cards, the "this stream" numbers, the Log filters and the refusal previews.
// The helpers touch no database, but lib/mixitup-health imports the KV client, so point it at the mock KV like the other checks.
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const p = await import('../lib/mixitup-page');
const c = await import('../lib/mixitup-core');
const h = await import('../lib/mixitup-health');

const now = 1_800_000_000_000;
const ago = (at: number, n: number) => `${Math.round((n - at) / 1000)}s ago`;
const none: import('../lib/mixitup-health').MixItUpHealth = { seen: {}, out: {} };
const settings = { connection: 'bridge' as const, currencyId: 'c1', currency: 'Brie Bucks', balanceUrl: '', deductUrl: '', addUrl: '', viewersUrl: '' };
const bridge = { at: now - 5_000, version: '1.2.0', currencies: [{ id: 'c1', name: 'Brie Bucks' }] };
const obsOk = { at: now - 5_000, connected: true, scene: 'Game', overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG' } };
const input = (over: Partial<import('../lib/mixitup-page').StatusInput> = {}) => ({ health: none, settings, bridge, paired: 1, obs: obsOk, now, ago, ...over });
const card = (id: string, over?: Partial<import('../lib/mixitup-page').StatusInput>) => p.statusCards(input(over)).find(x => x.id === id)!;

// ── Incoming card ──
let k = card('incoming');
ok(k.tone === 'muted' && k.todo && k.fix?.href.includes('tab=commands'), 'nothing received yet: waiting, with a what-to-do and a link');
k = card('incoming', { health: { seen: { '/api/webhooks/pull': { okAt: now - 60_000 }, '/api/webhooks/command': { okAt: now - 5_000 } }, out: {} } });
ok(k.tone === 'ok' && !k.todo && k.state.includes('chat commands'), 'a recent request is green and names the last route');
ok(k.rows.find(r => r.label === '!pack')?.text === '60s ago' && k.rows.find(r => r.label === 'show-off')?.text === 'no request yet', 'one row per route');
k = card('incoming', { health: { seen: { '/api/webhooks/pull': { okAt: now - 60_000, badAt: now - 1_000 } }, out: {} } });
ok(k.tone === 'warn' && k.state.includes('wrong secret') && k.fix, 'a wrong secret after the last good request warns');
k = card('incoming', { health: { seen: { '/api/webhooks/pull': { okAt: now - 1_000, badAt: now - 60_000 } }, out: {} } });
ok(k.tone === 'ok', 'a wrong secret that was followed by a good request is forgotten');

// ── Outgoing card, TCG Bridge ──
k = card('outgoing');
ok(k.tone === 'ok' && k.state === 'Working' && !k.todo, 'bridge connected, currency chosen: working');
k = card('outgoing', { paired: 0 });
ok(k.tone === 'bad' && k.state.includes('not paired') && k.fix?.href.includes('tab=connection'), 'not paired: red, links to Connection');
k = card('outgoing', { bridge: { ...bridge, at: now - 5 * 60_000 } });
ok(k.tone === 'bad' && k.state.includes('not connected') && k.todo, 'bridge silent for minutes: not connected');
k = card('outgoing', { bridge: { ...bridge, currencies: [] } });
ok(k.tone === 'warn' && k.state.includes('Mix It Up was not found'), 'no currencies reported: Mix It Up not found');
k = card('outgoing', { settings: { ...settings, currencyId: '' } });
ok(k.tone === 'warn' && k.state.includes('Choose the currency'), 'no currency chosen: warns');
k = card('outgoing', { health: { seen: {}, out: { balance: { at: now - 2_000, ok: false, detail: 'timed out' } } } });
ok(k.tone === 'warn' && k.todo?.includes('timed out'), 'the last call failed: warns with the reason');
ok(k.rows.some(r => r.label === 'Last balance' && r.tone === 'warn'), 'the failing call is a row');

// ── Outgoing card, direct addresses ──
const addr = { ...settings, connection: 'addresses' as const, balanceUrl: 'https://hook.example/b' };
k = card('outgoing', { settings: { ...addr, balanceUrl: '' } });
ok(k.tone === 'bad' && k.state.includes('No balance address'), 'addresses without a balance address: red');
k = card('outgoing', { settings: addr });
ok(k.tone === 'muted' && k.state.includes('not used yet'), 'addresses never called: waiting');
k = card('outgoing', { settings: addr, health: { seen: {}, out: { balance: { at: now - 1_000, ok: true, detail: 'HTTP 200' } } } });
ok(k.tone === 'ok', 'addresses answering: green');
k = card('outgoing', { settings: addr, health: { seen: {}, out: { balance: { at: now - 1_000, ok: false, detail: 'HTTP 500' } } } });
ok(k.tone === 'bad' && k.state.includes('failing'), 'an address that failed: red');

// ── OBS card ──
ok(card('obs').tone === 'ok', 'overlay visible in the scene: green');
ok(card('obs', { paired: 0 }).tone === 'muted' && !!card('obs', { paired: 0 }).fix, 'no bridge: not checked, link to pair');
ok(card('obs', { obs: null }).tone === 'muted' && !!card('obs', { obs: null }).todo, 'no report yet: waiting, with a what-to-do');
ok(card('obs', { obs: { ...obsOk, connected: false } }).tone === 'bad', 'OBS not connected: red');
ok(card('obs', { obs: { ...obsOk, at: now - 5 * 60_000 } }).tone === 'bad', 'a stale OBS report counts as not connected');
ok(card('obs', { obs: { ...obsOk, overlay: { ...obsOk.overlay, found: false } } }).fix?.href === '/admin/settings?tab=overlay', 'source not found: links to the overlay settings');
ok(card('obs', { obs: { ...obsOk, overlay: { ...obsOk.overlay, inProgram: false } } }).tone === 'warn', 'overlay not in the current scene: warns');
ok(card('obs', { obs: { ...obsOk, overlay: { ...obsOk.overlay, visible: false } } }).tone === 'warn', 'overlay hidden: warns');

// ── Set up button ──
ok(!p.needsSetup(p.statusCards(input({ health: { seen: { '/api/webhooks/pull': { okAt: now - 1_000 } }, out: {} } }))), 'everything green: no set up button');
ok(p.needsSetup(p.statusCards(input())), 'any card not green: the set up button shows');
ok(p.statusCards(input()).every(x => x.tone === 'ok' || !!x.todo), 'every card that is not green says what to do');

// ── The one-line chips are unchanged by the outLine split ──
const urls = { balance: 'https://hook.example/b', deduct: '', add: '', viewers: '' };
const chips = h.healthChips({ seen: {}, out: { balance: { at: now - 1_000, ok: true, detail: 'HTTP 200' } } }, urls, now, ago);
ok(chips.some(x => x.text.startsWith('Balance address') && x.tone === 'ok'), 'the chip row still reports the working balance address');
ok(chips.length >= 4, 'one chip per address kind plus the incoming ones');

// ── This stream ──
const e = (what: import('../lib/mixitup').MixItUpLogEntry['what'], ok: boolean, detail: string, at: number) => ({ at, username: 'ann', what, ok, detail });
const log = [
  e('deduct', true, '100 Brie Bucks', now - 1_000), e('deduct', true, '1,250 Brie Bucks', now - 2_000), e('deduct', false, 'HTTP 500', now - 3_000),
  e('add', true, '+100 Brie Bucks', now - 4_000), e('refused', false, 'insufficient_balance', now - 5_000), e('refused', false, 'limit_reached: 3 of 3', now - 6_000),
  e('refused', false, 'insufficient_balance: 5 of 100', now - 7_000), e('balance', true, '5 Brie Bucks', now - 8_000),
  e('deduct', true, '100 Brie Bucks', now - 5 * 3600_000), // before the stream started
];
const cmds = [e('command', true, '!stats', now - 1_000), e('command', false, '!bad', now - 2_000), e('command', true, '!stats', now - 9 * 3600_000)];
let n = p.streamNumbers(log, cmds, now - 3 * 3600_000, now);
ok(n.label === 'This stream', 'a stream marker labels it this stream');
ok(n.paid === 2 && n.taken === 1350, 'paid pulls and the currency taken count only confirmed deducts inside the stream');
ok(n.added === 100, 'added counts the add calls');
ok(n.commands === 1, 'commands count the ones that ran, inside the stream');
ok(n.refusals === 3 && n.topReason?.label === 'Not enough currency' && n.topReason.count === 2, 'refusals and the top reason (read from before the colon)');
ok(!n.partial, 'two short logs are complete');
n = p.streamNumbers(log, cmds, null, now);
ok(n.label === 'Last 24 hours' && n.paid === 3 && n.commands === 2, 'with no stream marker the window is the last 24 hours');
ok(p.streamNumbers([], [], null, now).topReason === null, 'no refusals: no top reason');
const full = Array.from({ length: p.LOG_CAP }, (_, i) => e('deduct', true, '10 Brie Bucks', now - i * 1_000));
ok(p.streamNumbers(full, [], now - 3600_000, now).partial, 'a full log with every line inside the stream is flagged partial');
ok(!p.streamNumbers(full, [], now - 5_000, now).partial, 'a full log that reaches back before the stream started is complete');
ok(p.streamNumbers([e('refused', false, 'odd_reason', now - 1_000)], [], null, now).topReason?.label === 'odd_reason', 'an unknown reason shows as written');

// ── Log filters ──
const mixed = [...log, ...cmds];
ok(p.pickLogFilter('refused') === 'refused' && p.pickLogFilter('nope') === 'all' && p.pickLogFilter(undefined) === 'all', 'the filter comes from the address; anything else is All');
ok(p.filterLog(mixed, 'all').length === mixed.length, 'All keeps every line');
ok(p.filterLog(mixed, 'in').every(x => x.what === 'command') && p.filterLog(mixed, 'in').length === 3, 'Incoming is the chat commands');
ok(p.filterLog(mixed, 'out').every(x => ['balance', 'deduct', 'add', 'test'].includes(x.what)), 'Outgoing is the calls to Mix It Up');
const refusals = p.filterLog([...mixed, e('revoked', false, 'x', now)], 'refused');
ok(refusals.length === 5 && refusals.some(x => x.what === 'revoked') && refusals.some(x => x.what === 'command' && !x.ok), 'Refusals: refused, revoked and failed commands');

// ── Reply previews ──
const sm = c.replySample({ cost: 100, currency: 'Brie Bucks', limit: 3 });
ok(c.renderReply(c.REPLY_DEFAULTS.insufficient_balance, sm).includes('100 Brie Bucks and you have 99'), 'the not-enough sentence uses the price, with a balance just short');
ok(c.renderReply(c.REPLY_DEFAULTS.limit_reached, sm).includes('all 3 pulls'), 'the limit sentence uses the limit');
ok(c.renderReply(c.REPLY_DEFAULTS.limit_reached, c.replySample({ cost: 5, currency: 'x', limit: 0 })).includes('all 3 pulls'), 'a limit of 0 previews a sample of 3');
ok(c.REPLY_KEYS.every(k => c.REPLY_LABELS[k] && c.renderReply(c.REPLY_DEFAULTS[k], sm)), 'every reply has a label and renders');

// ── The setup wizard (55.1): which steps are done, and where it opens ──
const wz = await import('../lib/mixitup-wizard');
const wizCards = (over: Partial<import('../lib/mixitup-page').StatusInput> = {}) => p.statusCards(input(over));
let d = wz.stepsDone(wizCards({ paired: 0, bridge: { at: null, version: '', currencies: [] }, obs: null }), none, false);
ok(!d.need && !d.incoming && !d.outgoing && wz.pickStep(undefined, d) === 'need', 'a fresh install opens on the first step');
const heard = { seen: { '/api/webhooks/pull': { okAt: now - 1_000 } }, out: {} };
d = wz.stepsDone(wizCards({ health: heard, paired: 0, bridge: { at: null, version: '', currencies: [] }, obs: null }), heard, false);
ok(d.need && d.incoming && !d.outgoing && wz.pickStep(undefined, d) === 'outgoing', 'once Mix It Up reached the site, reopening lands on the next step that is not done');
ok(wz.pickStep('incoming', d) === 'incoming' && wz.pickStep('nope', d) === 'outgoing', 'any step can be revisited; an unknown step falls back');
d = wz.stepsDone(wizCards({ health: heard }), { seen: { ...heard.seen, '/api/webhooks/stream': { okAt: now } }, out: {} }, true);
ok(d.outgoing && d.rules && d.events && wz.pickStep(undefined, d) === 'done', 'everything done lands on Done');
d = wz.stepsDone(wizCards({ health: { seen: { '/api/webhooks/pull': { okAt: now - 60_000, badAt: now - 1_000 } }, out: {} } }), none, false);
ok(!d.incoming, 'a wrong secret keeps the Mix It Up to the site step open');
const sc = (await import('../lib/mixitup-setup')).incomingSetup('https://x/api/webhooks/stream', 's3', { event: 'live' });
ok(sc.url === 'https://x/api/webhooks/stream' && JSON.parse(sc.body).secret === 's3' && JSON.parse(sc.body).event === 'live', 'a setup card holds the address and a body with the secret');

// ── Built-in !pack (wizard and Commands tab share packSetup) ──
const pk = (await import('../lib/mixitup-setup')).packSetup('https://x', 's4');
ok(pk.url === 'https://x/api/webhooks/pull' && JSON.parse(pk.body).secret === 's4' && JSON.parse(pk.body).pack === '$allargs', 'the !pack setup has the pull address, the secret and $allargs');
ok(pk.preset.name === 'pack' && pk.preset.path === 'pull', 'the !pack download is the pull command');
const cc = await import('../lib/commands-core');
ok(cc.builtInClash([{ name: '!Pack' }]) !== null && cc.builtInClash([{ name: 'flex', aliases: ['pack'] }]) !== null, 'a custom command cannot be named or aliased pack');
ok(cc.builtInClash([{ name: 'showoff' }, { name: 'stats', aliases: 'a b' }]) === null, 'ordinary names are accepted');

console.log('mixitup page checks passed');
process.exit(0);
