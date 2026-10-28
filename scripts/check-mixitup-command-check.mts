// Mix It Up command check (ROADMAP 57.8): what the site expects (!pack, switched-on chat commands, Stream Deck buffs, switched-on event rewards),
// the match by name against the commands the app reported, nothing shown before the app has reported, and the `status` answer the app polls.
// Against the mock KV. Run: npx tsx scripts/check-mixitup-command-check.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

import { createRequire } from 'node:module';
(createRequire(import.meta.url)('next/cache') as { revalidatePath: () => void }).revalidatePath = () => {};

const core = await import('../lib/mixitup-command-check-core');
const { DEFAULT_EVENT_REWARDS } = await import('../lib/event-rewards-core');
const b = await import('../lib/bridge');
const { runBridgeAction } = await import('../lib/bridge-actions');
const { checklistFacts } = await import('../lib/bridge-checklist');

// ── The expected list ──
const events = (patch: Record<string, unknown> = {}) => ({ ...DEFAULT_EVENT_REWARDS, ...patch }) as typeof DEFAULT_EVENT_REWARDS;
const chat = [{ name: 'showoff', enabled: true }, { name: 'stats', enabled: false }, { name: '  ', enabled: true }];
let want = core.expectedCommands({ chat, buffs: [{ name: 'Lucky Hour', streamDeck: true }, { name: 'Hidden', streamDeck: false }], events: events() });
ok(want.map(core.commandLabel).join('|') === '!pack|!showoff|Lucky Hour', `only what is switched on is expected: ${want.map(core.commandLabel)}`);
want = core.expectedCommands({ chat: [], buffs: [], events: events({ bits: { on: true, reward: 'packs', every: 500 }, 'gifted-subs': { on: true, reward: 'packs' } }) });
ok(want.filter(c => c.kind === 'event').map(c => c.name).join('|') === 'Gifted sub (one at a time)|Gifted subs (several at once)|Bits', `event rewards ask for their cards' commands: ${JSON.stringify(want)}`);
want = core.expectedCommands({ chat: [], buffs: [], events: events({ raidShoutout: { on: true, minViewers: 5 } }) });
ok(want.some(c => c.name === 'Raid'), 'the raid shout-out needs the Raid command');
ok(core.expectedCommands({ chat: [{ name: 'pack', enabled: true }], buffs: [], events: events() }).length === 1, 'a chat command called pack is not asked for twice');

// ── The comparison ──
const rows = core.checkCommands(core.expectedCommands({ chat, buffs: [{ name: 'Lucky Hour', streamDeck: true }], events: events() }), [{ name: '!PACK ' }, { name: 'lucky hour' }]);
ok(rows.map(r => r.found).join() === 'true,false,true', `names match without case or a leading !: ${JSON.stringify(rows)}`);
ok(core.missingLabels(rows).join() === '!showoff' && core.missingSummary(rows) === '1 Mix It Up command missing', 'the missing ones are named');
ok(core.missingSummary(rows.map(r => ({ ...r, found: true }))) === null, 'nothing missing, no summary');

// ── The status answer the app polls ──
const token = (await b.pairBridge((await b.createPairCode('josh')).code, 'Stream PC'))!.token;
const pc = (await b.bridgeGuard(new Request('http://localhost/x', { headers: { authorization: `Bearer ${token}` } })));
ok(pc.ok, 'paired');
const status = async () => runBridgeAction({ action: 'status' }, pc.ok ? pc.pc : undefined);
ok(!('commandsMissing' in (await status())) && !('commandsMissing' in (await checklistFacts())), 'nothing before the app has reported its commands');

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await b.storeHello({ version: '1.0', currencies: [{ id: 'c1', name: 'Brie Bucks' }], commands: [{ id: id(1), name: 'pack' }] });
const first = (await status()).commandsMissing ?? [];
ok(first.includes('!showoff') && first.includes('!stats') && !first.includes('!pack'), `!pack found, the default chat commands missing: ${first}`);
ok(JSON.stringify((await checklistFacts()).commandsMissing) === JSON.stringify(first), 'the checklist facts say the same');

await b.storeHello({ version: '1.0', currencies: [{ id: 'c1', name: 'Brie Bucks' }], commands: [{ id: id(1), name: 'pack' }, { id: id(2), name: 'showoff' }, { id: id(3), name: 'stats' }] });
ok(((await status()).commandsMissing ?? ['x']).length === 0, 'everything found: an empty list');

console.log('mixitup command check: ok');
