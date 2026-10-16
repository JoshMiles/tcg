// Mix It Up chat commands (ROADMAP 19.2): matching and aliases, cleaning, each action's variables against seeded data, private
// collectors masked, cooldowns, dry runs touching nothing, and the show-off action still queueing one event.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-commands.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const core = await import('../lib/commands-core');
const kvLib = await import('../lib/kv');
const { encodeEntry } = await import('../lib/variants');
const { kv } = await import('../lib/db');
const ser = await import('../lib/serials');
const cmds = await import('../lib/commands');
const { queueLength, clearQueue } = await import('../lib/webhooks');

// ── Pure ──
const base = core.cleanCommands(core.DEFAULT_COMMANDS);
ok(base.ok && base.commands.length === 2, 'the defaults are clean');
const list = base.ok ? base.commands : [];
ok(core.matchCommand(list, '!ShowOff')?.name === 'showoff' && core.matchCommand(list, 'stats')?.name === 'stats', 'names match without the ! and in any case');
ok(core.matchCommand(list, '!nope') === null && core.matchCommand(list, '') === null && core.matchCommand(list, 7) === null, 'an unknown or empty command matches nothing');
const aliased = core.cleanCommands([{ ...list[0], aliases: '!Flex, brag flex' }]);
ok(aliased.ok && aliased.commands[0].aliases.join() === 'flex,brag' && core.matchCommand(aliased.commands, '!brag')?.id === 'showoff', 'aliases are cleaned, unique and match');
ok(!core.cleanCommands([list[0], { ...list[1], aliases: ['showoff'] }]).ok, 'two commands cannot share a word');
ok(core.matchCommand([{ ...list[0], enabled: false }], 'showoff') === null, 'a switched-off command is unknown');
ok(!core.cleanCommands(Array.from({ length: core.MAX_COMMANDS + 1 }, (_, i) => ({ name: `c${i}`, action: 'text' }))).ok, 'at most 30 commands');
ok(core.interpolate('{a} and {nope}!', { a: 'x' }) === 'x and !', 'unknown placeholders are dropped');
const long = core.renderReply('**bold** `code` ' + 'x'.repeat(900), {});
ok(long.length <= core.REPLY_MAX && !/[*`]/.test(long), 'replies are capped and carry no Markdown');
for (const id of core.ACTION_IDS) ok(core.COMMAND_ACTIONS[id].vars.length > 0, `${id} lists its variables`);
const flat = core.flatReply(true, 'hi', { cardName: 'Goat', ok: 'x' });
ok(flat.cardName === 'Goat' && flat.ok === true && flat.message === 'hi', 'variables are flattened next to ok and message');

// ── Seeded data ──
await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const c = season.collectionName;
const cards = await kvLib.getPackCards('pack1');
const [a, b] = cards;
await kvLib.saveCollection(c, {
  ann: [encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'shiny'), encodeEntry(b.number, 'regular')],
  bob: [encodeEntry(a.number, 'regular')],
  priv: [encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'regular')],
});
await ser.backfillSerials(c, await kvLib.getCollection(c));
await kv.set('users:hidden', ['priv']);

const stored = await cmds.getCommands();
ok(stored.map(x => x.name).join() === 'showoff,stats', '!showoff and !stats are seeded on first read');
const run = async (command: string, username: string, args = '', dry = false) => { await kv.del('cmd:cd:stats'); return cmds.runCommand({ command, username, args, dry }); };

const unknown = await run('nothing', 'ann');
ok(!unknown.known && !unknown.ok && unknown.message === '', 'an unknown command is silent');

// card-stats
let r = await run('stats', 'ann', a.name);
ok(r.ok && r.vars.cardName === a.name && r.vars.number === String(a.number) && /^1 in \d/.test(r.vars.pullChance), '!stats answers with the card');
ok(r.vars.yourPrints === '2' && r.vars.printsMade === '7', `!stats counts prints (${r.vars.printsMade}) and the caller's own (${r.vars.yourPrints})`);
ok(r.vars.topHolder === 'a private collector', 'a hidden top holder is not named');
ok(r.vars.collectors === '2', `collectors leave out the hidden one (${r.vars.collectors})`);
ok(r.vars.firstPulledBy !== 'priv' && r.vars.url.includes(`card=${a.number}`), 'the first puller and link are filled');
ok(!JSON.stringify(r).includes('"priv"'), 'the private collector never appears by name');
ok(r.message.includes(a.name) && r.message.includes('prints made'), 'the reply is built from the template');
r = await run('stats', 'ann', `#${b.number}`);
ok(r.ok && r.vars.cardName === b.name, 'a card number works too');
r = await run('stats', 'ann', 'zzzz not a card');
ok(!r.ok && /could not find/.test(r.message), 'an unknown card is a refusal');
r = await run('stats', 'ann', '');
ok(!r.ok && /Which card/.test(r.message), 'no card named asks which');

// my-stats
const mine = core.cleanCommands([{ name: 'me', action: 'my-stats', reply: '#{rank} {score} {cards}/{totalCards}' }]);
const withMe = mine.ok ? mine.commands : [];
const ms = (u: string, args = '') => cmds.runCommand({ command: 'me', username: u, args }, withMe);
let m = await ms('ann');
ok(m.ok && m.vars.cards === '2' && m.vars.prints === '3' && Number(m.vars.score) > 0 && /^\d+$/.test(m.vars.rank), 'my-stats reports the caller');
m = await ms('bob', '@priv');
ok(!m.ok && /keeps their stats private/.test(m.message), "someone else's private stats are refused");
m = await ms('priv');
ok(m.ok && m.vars.prints === '4', 'a private collector can see their own stats');
m = await ms('ann', '@bob');
ok(m.ok && m.vars.prints === '1', '@someone looks at another collector');
m = await ms('ghost');
ok(!m.ok, 'a viewer with no cards gets a refusal');

// leaderboard, text, pulls-left
const more = core.cleanCommands([
  { name: 'top', action: 'leaderboard', reply: '{first} | {second} | {third}' },
  { name: 'hi', action: 'text', reply: 'Hi {username} {args}' },
  { name: 'left', action: 'pulls-left', reply: '{left} of {limit}' },
]);
const other = more.ok ? more.commands : [];
const o = (command: string, u = 'ann', args = '') => cmds.runCommand({ command, username: u, args }, other);
let t = await o('top');
ok(t.ok && t.message.includes('ann (') && !t.message.includes('priv'), 'the leaderboard names the top collectors and leaves out hidden ones');
t = await o('hi', 'Ann', 'there');
ok(t.ok && t.message === 'Hi ann there', 'text fills {username} and {args}');
t = await o('left');
ok(!t.ok && /off/.test(t.message), 'pulls-left says so while paid pulls are off');

// ── Show-off: one real event, none in a dry run ──
await clearQueue();
await kv.del('showoff:cd:ann');
r = await run('showoff', 'ann', a.name, true);
ok(r.ok && (await queueLength()) === 0, 'a dry show-off queues nothing');
ok((await kv.get('showoff:cd:ann')) === null, 'and spends no cooldown');
r = await run('showoff', 'ann', a.name);
ok(r.ok && r.vars.cardName === a.name && r.vars.variant === 'Shiny Full Art' && (await queueLength()) === 1, 'a real show-off queues one event');
ok(r.message.startsWith('Showing off your Shiny'), `the reply reads as before: ${r.message}`);
r = await run('showoff', 'ann', a.name);
ok(!r.ok && /try again/.test(r.message) && (await queueLength()) === 1, 'the show-off cooldown still holds and queues nothing');
await kv.del('showoff:cd:ann');
r = await run('showoff', 'bob', b.name);
ok(!r.ok && /don't have/.test(r.message) && (await queueLength()) === 1, 'a card they do not own queues nothing');

// ── Cooldowns and error texts ──
const cd = core.cleanCommands([{ name: 'cool', action: 'text', reply: 'ok', cooldownS: 30, userCooldownS: 0, errors: { cooldown: 'Slow down {username}' } }, { name: 'peruser', action: 'text', reply: 'ok', userCooldownS: 30 }]);
const cdl = cd.ok ? cd.commands : [];
const k = (command: string, u: string, dry = false) => cmds.runCommand({ command, username: u, args: '', dry }, cdl);
ok((await k('cool', 'ann', true)).ok && (await k('cool', 'ann', true)).ok, 'a dry run never spends the cooldown');
ok((await k('cool', 'ann')).ok, 'the first run works');
const second = await k('cool', 'bob');
ok(!second.ok && second.message === 'Slow down bob', "the command's own cooldown text is used, with the viewer's name");
ok((await k('peruser', 'ann')).ok && !(await k('peruser', 'ann')).ok && (await k('peruser', 'bob')).ok, 'a per-viewer cooldown holds one viewer only');

// ── The log and counts ──
const log = await cmds.getCommandLog();
ok(log.length > 0 && log.every(e => e.what === 'command'), 'runs are logged');
const stats = await cmds.getCommandStats();
ok((stats.showoff?.count ?? 0) >= 1 && (stats.stats?.count ?? 0) >= 1, 'runs are counted');
const before = (await cmds.getCommandLog()).length;
await run('stats', 'ann', a.name, true);
ok((await cmds.getCommandLog()).length === before, 'a dry run is not logged');

console.log('commands checks passed');
