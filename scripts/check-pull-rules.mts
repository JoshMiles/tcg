// Mix It Up commands on big pulls (ROADMAP 55.6d): which rule a pull meets, what is accepted on save, the command list a bridge reports, and
// that a ticketed save through the real POST /api/collection queues exactly one run-command job (none without a ticket, in a sandbox or
// with no bridge paired). Against the mock KV. Run: npx tsx scripts/check-pull-rules.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv, runInSandbox } = await import('../lib/db');
const draw = await import('../lib/draw');
const m = await import('../lib/mixitup');
const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
const r = await import('../lib/pull-rules-core');
const mc = await import('../lib/mixitup-core');
const { POST } = await import('../app/api/collection/route');
import type { PullFacts, PullRule } from '../lib/pull-rules-core';

const C1 = 'cccccccc-0000-0000-0000-000000000001';
const C2 = 'cccccccc-0000-0000-0000-000000000002';
const C3 = 'cccccccc-0000-0000-0000-000000000003';
const rule = (id: string, commandId: string, when: PullRule['when'] = {}, on = true): PullRule => ({ id, on, when, commandId });
const pull = (o: Partial<PullFacts> = {}): PullFacts => ({ username: 'ann', cardName: 'Gouda Goat', stars: 3, variant: 'regular', isNew: false, ...o });
const commandJobs = async () => (await kv.lrange<core.BridgeJob>('bridge:jobs', 0, -1)).filter(j => j.kind === 'run-command');

// ── matchRule: the first switched-on rule whose set conditions all hold ──
const rules = [rule('a', C1, { minRarity: 5 }), rule('b', C2, { variants: ['full', 'shiny'] }), rule('c', C3, { newToDex: true }, false), rule('d', C3, { newToDex: true })];
ok(r.matchRule(rules, pull({ stars: 5 }))?.id === 'a', 'minimum rarity: 5 stars meets it');
ok(r.matchRule(rules, pull({ stars: 4 })) === null, '4 stars does not meet a 5 star minimum');
ok(r.matchRule(rules, pull({ stars: 5, variant: 'full' }))?.id === 'a', 'the first match wins, the later one is skipped');
ok(r.matchRule(rules, pull({ variant: 'shiny' }))?.id === 'b' && r.matchRule(rules, pull({ variant: 'reverse' })) === null, 'variants: one of the listed ones');
ok(r.matchRule(rules, pull({ isNew: true }))?.id === 'd', 'a switched-off rule is skipped (c), the next one (d) runs');
ok(r.matchRule([rule('x', C1, { minRarity: 3, variants: ['golden'], newToDex: true })], pull({ stars: 3, variant: 'golden', isNew: false })) === null, 'every set condition must hold');
ok(r.matchRule([rule('x', C1)], pull())?.id === 'x' && r.matchRule([], pull()) === null, 'no condition = every pull; no rules = none');
ok(JSON.stringify(r.pullArgs(pull({ stars: 4, variant: 'shiny' }))) === JSON.stringify(['ann', 'Gouda Goat', 'Epic', 'Full Art Holo']), 'args: viewer, card, rarity label, variant label');

// ── Saving: a command must be one the bridge reported; limits and junk ──
const form = new FormData();
form.set('rule_0_id', 'r1'); form.set('rule_0_on', 'on'); form.set('rule_0_min', '4'); form.append('rule_0_variants', 'shiny'); form.append('rule_0_variants', 'golden'); form.set('rule_0_new', 'on'); form.set('rule_0_command', C1.toUpperCase());
form.set('rule_1_id', ''); form.set('rule_1_command', C2); form.set('rule_1_min', '');
form.set('rule_2_id', ''); form.set('rule_2_command', ''); // the empty "Add a rule" row is skipped
const parsed = r.rulesFromForm(form);
ok(parsed.length === 2, 'the form reads the filled rows and skips the empty one');
const saved = r.cleanRulesInput(parsed, [C1, C2], []);
ok(saved.ok && saved.rules[0].commandId === C1 && saved.rules[0].on && saved.rules[0].when.minRarity === 4 && saved.rules[0].when.newToDex === true && saved.rules[0].when.variants?.join() === 'shiny,golden', 'a good rule is kept (id lowercased, variants in order)');
ok(saved.ok && !saved.rules[1].on && saved.rules[1].when.minRarity === undefined && saved.rules[1].id.length > 0, 'a new row gets an id and is off unless ticked');
const refuse = (raw: unknown[], reported: string[], existing: PullRule[] = []) => { const x = r.cleanRulesInput(raw, reported, existing); return x.ok ? '' : x.message; };
ok(/not in the list/.test(refuse([{ id: 'a', on: true, when: {}, commandId: C3 }], [C1, C2])), 'a command the bridge never reported is refused');
ok(/not in the list/.test(refuse([{ id: 'a', on: true, when: {}, commandId: C1 }], [], [])) || /pair TCG Bridge/.test(refuse([{ id: 'a', on: true, when: {}, commandId: C1 }], [], [])), 'with no list a new command is refused');
ok(refuse([{ id: 'a', on: true, when: {}, commandId: C1 }], [], [rule('a', C1)]) === '', 'with the list empty for a moment a rule keeps the command it already had');
ok(/rarity/.test(refuse([{ id: 'a', on: true, when: { minRarity: 6 }, commandId: C1 }], [C1])) && /rarity/.test(refuse([{ id: 'a', on: true, when: { minRarity: 2.5 }, commandId: C1 }], [C1])), 'rarity must be 1 to 5');
ok(/version/.test(refuse([{ id: 'a', on: true, when: { variants: ['mythic'] }, commandId: C1 }], [C1])), 'an unknown variant is refused');
ok(/At most 10/.test(refuse(Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, on: true, when: {}, commandId: C1 })), [C1])), 'at most 10 rules');
ok(/repeats/.test(refuse([{ id: 'a', on: true, when: {}, commandId: C1 }, { id: 'a', on: true, when: {}, commandId: C1 }], [C1])), 'a repeated rule id is refused');
const one = r.cleanRulesInput([{ id: 'a', on: true, when: { minRarity: 1 }, commandId: C1 }], [C1], []);
ok(one.ok && one.rules[0].when.minRarity === undefined, 'at least 1 star is every card: stored as no condition');

// ── Settings: no rules by default; junk in KV never reaches a pull; the Paid pulls form keeps them ──
ok(mc.normalizeMixItUp(null).pullRules.length === 0, 'no rules by default');
const dirty = mc.normalizeMixItUp({ pullRules: [rule('ok', C1, { minRarity: 4 }), { id: 'bad id!', commandId: C1 }, { id: 'nocmd', commandId: 'nope' }, 'x', null, rule('ok2', C2, { variants: ['full', 'nonsense'] as never })] });
ok(dirty.pullRules.map(x => x.id).join() === 'ok,ok2' && dirty.pullRules[1].when.variants?.join() === 'full', 'unusable rules and unknown variants are dropped on read');
ok(mc.normalizeMixItUp({ pullRules: Array.from({ length: 30 }, (_, i) => rule(`r${i}`, C1)) }).pullRules.length === 10, 'at most 10 are read');

// ── What a bridge reports: commands beside the currencies, old keys kept ──
const longName = 'N'.repeat(300);
const hello = core.cleanHello({ version: '1', currencies: [], commands: [{ id: C1.toUpperCase(), name: ` ${longName} ` }, { id: 'not-a-guid', name: 'x' }, { id: C2, name: '  ' }, { id: C3, name: 'Lights' }, 5] });
ok(hello?.commands?.length === 2 && hello.commands[0].id === C1 && hello.commands[0].name.length === 100, 'commands: GUID ids only, lowercased, named, names cut at 100');
ok(core.cleanHello({ version: '1', currencies: [] })?.commands === undefined, 'an older app sends no commands');
ok((core.cleanHello({ version: '1', currencies: [], commands: Array.from({ length: 800 }, (_, i) => ({ id: `cccccccc-0000-0000-0000-${String(i).padStart(12, '0')}`, name: `c${i}` })) })?.commands?.length) === 500, 'at most 500 commands');
ok(await b.storeHello({ version: '0.4.0', currencies: [{ id: 'cur-1', name: 'Brie Bucks' }], commands: [{ id: C1, name: 'Big pull sound' }, { id: C2, name: 'Lights' }] }), 'hello with commands is stored');
let state = await b.readBridge();
ok(state.commands.length === 2 && state.commands[0].name === 'Big pull sound' && state.currencies.length === 1, 'the commands are kept beside the currencies');
ok(await b.storeHello({ version: '0.3.0', currencies: [{ id: 'cur-1', name: 'Brie Bucks' }] }), 'an older app says hello');
state = await b.readBridge();
ok(state.commands.length === 2, 'the command list is kept when an older app says hello');
ok(await b.storeHello({ version: '0.4.0', currencies: [], commands: [] }) && (await b.readBridge()).commands.length === 0, 'a new empty list replaces the old one');
await b.storeHello({ version: '0.4.0', currencies: [], commands: [{ id: C1, name: 'Big pull sound' }] });

// ── Firing: the real route, a ticketed save ──
await kvLib.seedSeason1();
const save = (ticket: string, username = 'ann') => POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username, ticket } }) }));
const withRules = (pullRules: PullRule[]) => m.saveMixItUpSettings({ ...mc.normalizeMixItUp(null), pullRules });
const clearJobs = () => kv.del('bridge:jobs');

await withRules([rule('everything', C1)]);
await clearJobs();

// no bridge paired: nothing queued, the save is unaffected
ok(!!(await draw.issueDraw('p0', 'ann')), 'a draw was issued');
const noBridge = await save('p0');
ok(noBridge.status === 200 && (await commandJobs()).length === 0, 'no bridge paired: the pull is saved and no job is queued');

const code = await b.createPairCode('check');
ok(!!(await b.pairBridge(code.code, 'Stream PC')), 'a bridge is paired');

// a ticketed save queues exactly one job, with the four arguments, and does not wait for a result
ok(!!(await draw.issueDraw('p1', 'ann')), 'a draw was issued');
const t0 = Date.now();
const res = await save('p1');
const body = await res.json() as { ok: boolean };
ok(res.status === 200 && body.ok && Date.now() - t0 < 2000, 'the save answers without waiting for a bridge');
const jobs = await commandJobs();
ok(jobs.length === 1 && jobs[0].commandId === C1 && jobs[0].args?.length === 4 && jobs[0].args[0] === 'ann', 'a ticketed save queues exactly one run-command job');
ok(core.isFreshJob(jobs[0], Date.now()), 'and the bridge will claim it');

// the same ticket again is refused and queues nothing more; a save without a ticket queues nothing
const repeat = await save('p1');
ok(repeat.status === 401 && (await commandJobs()).length === 1, 'a ticket works once: no second job');
const noTicket = await save('does-not-exist');
const blank = await POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: 'ann' } }) }));
ok(noTicket.status === 401 && blank.status === 401 && (await commandJobs()).length === 1, 'an unticketed or unknown-ticket save queues nothing');

// first match wins; a switched-off rule never runs; a rule the pull does not meet queues nothing
await withRules([rule('off', C1, {}, false), rule('second', C2), rule('third', C3)]);
await clearJobs();
await draw.issueDraw('p2', 'ann');
await save('p2');
const second = await commandJobs();
ok(second.length === 1 && second[0].commandId === C2, 'the first matching rule that is on runs, and only that one');
await withRules([rule('golden', C1, { variants: ['golden'] })]);
await clearJobs();
await draw.issueDraw('p3', 'ann');
await save('p3');
ok((await commandJobs()).length === 0, 'a pull that meets no rule queues nothing');

// "new to the dex": only the first copy of a card for that viewer
await withRules([rule('new', C1, { newToDex: true })]);
await clearJobs();
await draw.issueDraw('p4', 'zed');
await save('p4', 'zed');
ok((await commandJobs()).length === 1, 'a viewer\'s first pull is new to their dex');

// rules off by default: with none saved nothing is queued; a saved off rule too
await withRules([]);
await clearJobs();
await draw.issueDraw('p5', 'ann');
await save('p5');
ok((await commandJobs()).length === 0, 'no rules, no job');

// a sandbox never queues, whatever the rules say (the rules are read from the sandbox's own settings, so call the firing directly too)
await withRules([rule('everything', C1)]);
await clearJobs();
ok((await runInSandbox('rulesbox', () => m.firePullRules(pull()))) === false && (await commandJobs()).length === 0, 'a sandbox queues nothing');
ok((await runInSandbox('rulesbox', () => b.bridgeRunCommand(C1, ['x']))) === false && (await commandJobs()).length === 0, 'and neither does the queue call');
ok((await m.firePullRules(pull())) === true && (await commandJobs()).length === 1, 'outside a sandbox the same call queues one');

// the Test button's call, and what the job looks like
await clearJobs();
ok((await b.bridgeRunCommand(C2, r.pullArgs(r.SAMPLE_PULL))) === true, 'the Test call queues');
const test = (await commandJobs())[0];
ok(test.commandId === C2 && JSON.stringify(test.args) === JSON.stringify(['cheesyviewer', 'Gouda Goat', 'Epic', 'Full Art Holo']), 'with the sample pull');
await clearJobs();

// revealInMs: the overlay says how long until the card is shown; the route clamps it (0 to 15 s) and assumes 3 s when it is missing
ok(r.revealDelay(1800) === 1800 && r.revealDelay(-5) === 0 && r.revealDelay(99_000) === 15_000 && r.revealDelay(1234.6) === 1235, 'revealDelay: clamped to 0..15000');
ok(r.revealDelay(undefined) === 3000 && r.revealDelay('4000') === 3000 && r.revealDelay(NaN) === 3000 && r.revealDelay(Infinity) === 3000, 'revealDelay: missing or not a number = 3000');
await withRules([rule('everything', C1)]);
const saveWith = async (ticket: string, revealInMs?: unknown) => {
  await clearJobs();
  await draw.issueDraw(ticket, 'ann');
  await POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: 'ann', ticket }, ...(revealInMs === undefined ? {} : { revealInMs }) }) }));
  return (await commandJobs())[0];
};
ok((await saveWith('d1', 2800))?.delayMs === 2800, 'the job carries the delay the overlay sent');
ok((await saveWith('d2', 90_000))?.delayMs === 15_000, 'a huge delay is clamped to 15 s');
ok((await saveWith('d3', -40))?.delayMs === undefined, 'a negative delay is 0: the job carries none');
ok((await saveWith('d4'))?.delayMs === 3000, 'an old cached overlay (no revealInMs) gets 3 s');
await clearJobs();

console.log('pull rules checks passed');
