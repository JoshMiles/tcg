// The community pack goal (ROADMAP 57.5): the input and text rules, a goal for an old stream key reading as no goal, counting real pulls only
// (a test pull never reaches the counter, a sandbox counts nothing), the reward firing exactly once when pulls cross the target together,
// both reward types, and the progress text on the bridge's `stats` action. Against the mock KV.
// Run: node scripts/run-checks.mjs pack-goal
import { readFileSync } from 'node:fs';
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const core = await import('../lib/pack-goal-core');
const goalLib = await import('../lib/pack-goal');
const { kv, runInSandbox } = await import('../lib/db');
const buffs = await import('../lib/buffs');
const buffsCore = await import('../lib/buffs-core');
const { getUserAudit } = await import('../lib/audit');
const { getStreamBuff } = await import('../lib/pull-limit');
const { streamBuffAmount } = await import('../lib/pull-limit-core');
const { currentStreamKey } = await import('../lib/mixitup');
const { readBridgeStats } = await import('../lib/bridge-stats');

// ── Input and the words ──
ok(core.cleanGoalInput({ target: '50', label: '  Big goal ', reward: 'none' }).ok, 'a plain goal is accepted');
const bad = [{ target: 0 }, { target: -3 }, { target: 'x' }, { target: 2.5 }, { target: core.GOAL_TARGET_MAX + 1 }, { target: 5, reward: 'pulls', amount: 0 }, { target: 5, reward: 'buff' }];
for (const b of bad) ok(!core.cleanGoalInput(b).ok, `refused: ${JSON.stringify(b)}`);
ok(JSON.stringify((core.cleanGoalInput({ target: 5, reward: 'cash' }) as { reward: unknown }).reward) === '{"type":"none"}', 'an unknown reward is no reward');
const long = core.cleanGoalInput({ target: 5, label: 'x'.repeat(200) });
ok(long.ok && long.label.length === core.GOAL_LABEL_MAX, 'a long label is cut');
const blank = core.cleanGoalInput({ target: 5, label: '   ' });
ok(blank.ok && blank.label === core.GOAL_LABEL_DEFAULT, 'a blank label gets the default');
ok(core.goalText('Pack goal', 37, 50) === 'Pack goal: 37 / 50', 'the text is label, count and target');
ok(core.goalText('G', 70, 50) === 'G: 50 / 50' && core.goalText('G', -2, 50) === 'G: 0 / 50', 'the count stays between 0 and the target');
ok(core.goalChatLine('G', '') === 'Pack goal reached: G!' && core.goalChatLine('G', 'Hi.') === 'Pack goal reached: G! Hi.', 'the chat line, with and without a reward');

// ── No goal: nothing counts, nothing is read as a goal ──
ok((await goalLib.readPackGoal()) === null && (await goalLib.packGoalText()) === null, 'no goal set reads as none');
await goalLib.countPackGoalPull();
ok((await kv.get('packgoal:goal')) === null, 'with no goal a pull stores nothing');

// ── Old stream key: a goal from an earlier stream is no goal (and counts nothing) ──
const now = await currentStreamKey();
await kv.set('packgoal:goal', { target: 3, label: 'Old', reward: { type: 'none' }, by: 'x', setAt: 111, streamKey: 's1' });
ok((await goalLib.readPackGoal()) === null && (await goalLib.packGoalText()) === null, 'a goal for an old stream key reads as none');
await goalLib.countPackGoalPull();
ok((await kv.get('packgoal:n:111')) === null, 'an old goal counts nothing');
await kv.del('packgoal:goal');

// ── The route only counts real pulls: the hook sits inside `if (!test)` ──
const route = readFileSync(new URL('../app/api/collection/route.ts', import.meta.url), 'utf8');
ok(/if \(!test\) \{[^}]*countPackGoalPull\(\)/.test(route), 'the collection route counts a pull only when it is not a test pull');
ok((route.match(/countPackGoalPull/g) ?? []).length === 2, 'the goal is counted in one place (import and one call)');

// ── Setting a goal ──
const jobs = async () => (await kv.lrange<{ kind: string; text?: string }>('bridge:jobs', 0, -1)).filter(j => j.kind === 'say');
const audit = async () => (await getUserAudit('everyone', 100)).map(e => e.action);
let r = await goalLib.setPackGoal({ target: 5, label: 'Goal A', reward: 'buff', buffId: 'nope' }, 'josh');
ok(!r.ok, 'a buff that does not exist is refused');
r = await goalLib.setPackGoal({ target: 5, label: 'Goal A', reward: 'pulls', amount: 2 }, 'josh');
ok(r.ok, 'a pulls goal is set');
let cur = await goalLib.readPackGoal();
ok(cur?.goal.streamKey === now && cur.count === 0, 'the goal belongs to this stream and starts at 0');
ok((await goalLib.packGoalText()) === 'Goal A: 0 / 5', 'the progress text');

// A sandbox counts nothing
await runInSandbox('goalbox', () => goalLib.countPackGoalPull());
ok((await goalLib.readPackGoal())?.count === 0, 'a sandbox pull is not counted');

// Four pulls: not there yet
for (let i = 0; i < 4; i++) await goalLib.countPackGoalPull();
ok((await goalLib.packGoalText()) === 'Goal A: 4 / 5' && (await jobs()).length === 0, 'four of five: no chat line yet');
const stats = await readBridgeStats(['goal', 'packs']);
ok(stats.goal === 'Goal A: 4 / 5' && !('queue' in stats), `the bridge stat carries the goal text: ${JSON.stringify(stats)}`);

// Two pulls cross the target together: the reward fires exactly once
await Promise.all([goalLib.countPackGoalPull(), goalLib.countPackGoalPull(), goalLib.countPackGoalPull()]);
const said = await jobs();
ok(said.length === 1 && said[0].text?.startsWith('Pack goal reached: Goal A!') && said[0].text.includes('2 extra pulls'), `one chat line: ${JSON.stringify(said)}`);
ok(streamBuffAmount(await getStreamBuff(), now) === 2, 'the extra pulls were given once');
ok((await audit()).filter(a => a.startsWith('Pack goal reached')).length === 1, 'one audit line');
ok((await goalLib.packGoalText()) === 'Goal A: 5 / 5', 'the text stays at the target');

// The same goal cannot fire again, even if the count is brought back to the target
const g = (await goalLib.readPackGoal())!.goal;
await kv.del(`packgoal:n:${g.setAt}`);
for (let i = 0; i < 5; i++) await goalLib.countPackGoalPull();
ok((await jobs()).length === 1 && streamBuffAmount(await getStreamBuff(), now) === 2, 'a goal pays out once');

// ── A community buff reward, and clearing ──
const def = buffsCore.cleanBuffDefInput({ id: 'crowd', name: 'Crowd pulls', type: 'extra-pulls', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'community' });
if (!def.ok) throw new Error('buff def: ' + JSON.stringify(def));
await buffs.saveBuffDefs([def.def]);
await new Promise(res => setTimeout(res, 5)); // a new setAt
r = await goalLib.setPackGoal({ target: 1, label: 'Goal B', reward: 'buff', buffId: 'crowd' }, 'josh');
ok(r.ok, 'a community buff goal is set');
await goalLib.countPackGoalPull();
ok((await buffs.getCommunityBuffs()).some(b => b.buffId === 'crowd'), 'the community buff was applied');
ok((await jobs()).length === 2 && (await jobs())[1].text?.startsWith('Pack goal reached: Goal B!'), 'its chat line');

const cleared = await goalLib.clearPackGoal('josh');
ok(cleared.wasOn && (await goalLib.readPackGoal()) === null && (await goalLib.packGoalText()) === null, 'clearing removes the goal');
ok((await readBridgeStats(['goal'])).goal === null, 'the stat is null when there is no goal');
console.log('pack goal ok');
