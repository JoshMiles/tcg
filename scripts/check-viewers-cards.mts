// What viewers get cards (ROADMAP 63.3): every old tab id opens its card, the one-line summaries, the Mix It Up commands helper list, and that a save from one
// card leaves the other cards' fields alone (through the save functions behind the server actions, against the mock KV).
// Run: node scripts/run-checks.mjs viewers-cards
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const vc = await import('../lib/viewers-cards');
const sp = await import('../lib/stream-page');
const helper = await import('../lib/viewers-helper');
const { presetFile, presetHref } = await import('../lib/mixitup-presets');
const mix = await import('../lib/mixitup');
const save = await import('../lib/viewers-save');
const { normalizeMixItUp } = await import('../lib/mixitup-core');

// ── Old tab ids ──
const WANT: Record<string, string> = { paid: 'paid', bigpulls: 'bigpulls', chat: 'startend', commands: 'commands', streamdeck: 'streamdeck', events: 'events' };
for (const [tab, card] of Object.entries(WANT)) {
  const r = sp.resolveStream(undefined, tab);
  ok(r.section === 'viewers' && r.card === card, `?tab=${tab} opens the ${card} card`);
  ok(sp.legacyStreamHref({ tab }) === `/admin/stream?section=viewers&card=${card}`, `/admin/mixitup?tab=${tab} redirects to the ${card} card`);
}
ok(vc.CARDS.length === 9 && new Set(vc.CARDS.map(c => c.id)).size === 9, 'nine cards with their own ids');
ok(sp.resolveStream('viewers', undefined, 'shoutout').card === 'shoutout' && sp.resolveStream(undefined, undefined, 'points').section === 'viewers', 'a card id opens its card, even without a section');
ok(sp.resolveStream('viewers', undefined, 'nope').card === null && sp.resolveStream('viewers', 'nope', '__proto__').card === null, 'an unknown card is the grid');
ok(vc.cardHref('points') === '/admin/stream?section=viewers&card=points', 'card address');
for (const c of vc.CARDS) ok(sp.resolveStream(undefined, undefined, c.id).card === c.id, `${c.id} resolves`);

// ── Summaries ──
const base = normalizeMixItUp({});
const sum = (over: Partial<Parameters<typeof vc.cardSummaries>[0]> = {}, s = base) => vc.cardSummaries({ settings: s, packCount: 3, commands: [], deckBuffs: [], rewardIds: [], awardIds: [], ...over });
const paid = sum({}, { ...base, enabled: true, cost: 200, currency: 'Brie Bucks', roleLimits: { ...base.roleLimits, regular: 5 } }).paid;
ok(paid.on && paid.text === '200 Brie Bucks a pull, 5 per viewer each stream', `paid line: ${paid.text}`);
ok(!sum().paid.on, 'paid off when charging is off');
ok(sum({ rewardIds: ['a', 'b', 'c', 'd', 'e'], awardIds: ['a', 'c'] }).points.text === '2 of 5 rewards give something', 'channel points line');
ok(sum({ rewardIds: ['a'], awardIds: [] }).points.on === false, 'no awards is off');
const evOn = { ...base, eventRewards: { ...base.eventRewards, bits: { ...base.eventRewards.bits, on: true }, raid: { ...base.eventRewards.raid, on: true } } };
ok(/^2 of 4 events give something/.test(sum({}, evOn).events.text), `events line: ${sum({}, evOn).events.text}`);
ok(sum({}, { ...base, eventRewards: { ...base.eventRewards, raidShoutout: { on: true, minViewers: 8 } } }).shoutout.text === 'On for raids of 8 or more viewers', 'shout-out line');
ok(sum({ commands: [{ name: 'stats', enabled: true }, { name: 'old', enabled: false }] }).commands.text === '1 command on: !stats', 'commands line');
ok(sum({ packCount: 1 }).packs.text === '1 pack viewers can ask for by name', 'packs line');
ok(sum({ deckBuffs: ['Lucky'] }).streamdeck.text.startsWith('1 buff on the Stream Deck: Lucky'), 'stream deck line');
ok(Object.keys(sum()).sort().join() === vc.CARDS.map(c => c.id).sort().join(), 'a summary for every card');

// ── The helper lists every download, and each one makes a file ──
const groups = helper.helperGroups({ commands: [{ name: 'stats', enabled: true }, { name: 'off', enabled: false }], deckBuffs: [{ id: 'lucky', name: 'Lucky', community: false, note: 'x' }] });
const titles = groups.flatMap(g => g.presets.map(p => p.title));
for (const want of ['!pack', '!stats', 'Lucky', 'Extra pulls this stream', 'Happy hour', 'Free pack', 'Stream start', 'Stream end', 'Raid', 'Bits']) ok(titles.includes(want), `the helper lists ${want}`);
ok(!titles.includes('!off'), 'a command that is off is not listed');
for (const g of groups) for (const p of g.presets) ok(presetFile(new URL(presetHref(p.spec), 'http://x').searchParams.get('spec'), 'http://site', 'sekret')?.text.includes('sekret'), `${p.title} makes a file`);

// ── A save from one card leaves the others alone ──
const get = (o: Record<string, string>) => (k: string) => o[k];
const cur = async () => mix.getMixItUpSettings();
const mk = await cur();
await mix.saveMixItUpSettings({ ...mk, enabled: true, cost: 120, eventRewards: { ...mk.eventRewards, bits: { on: true, reward: 'packs', every: 300 }, raidShoutout: { on: true, minViewers: 9 } }, chat: { ...mk.chat, startOn: true, startText: 'Hello {channel}', backup: true, check: true }, overlayWatchdog: true });

let s = await cur();
const r = await save.savePaidFields({ cost: '150' }, 'paid');
s = await cur();
ok(r.ok && s.cost === 150 && s.enabled === false, 'the paid save sets the price and (unticked) the switch');
ok(s.eventRewards.bits.on && s.eventRewards.bits.every === 300 && s.eventRewards.raidShoutout.on && s.eventRewards.raidShoutout.minViewers === 9, 'the paid save leaves event rewards and the shout-out');
ok(s.chat.startOn && s.chat.startText === 'Hello {channel}' && s.chat.backup && s.chat.check && s.overlayWatchdog, 'the paid save leaves chat, safety and the watchdog');
ok(!(await save.savePaidFields({ cost: '-3' }, 'paid')).ok, 'paid validation still refuses a bad price');

await save.saveEventRewards(get({ 'ev_gifted-subs_on': 'on', ev_bits_on: 'on', ev_bits_every: '700' }), 'events');
s = await cur();
ok(s.eventRewards['gifted-subs'].on && s.eventRewards.bits.every === 700, 'the events save sets the events');
ok(!s.eventRewards.raid.on && !s.eventRewards.redeem.on, 'an unticked event is off');
ok(s.eventRewards.raidShoutout.on && s.eventRewards.raidShoutout.minViewers === 9, 'the events save leaves the shout-out');
ok(s.cost === 150 && s.chat.startOn, 'the events save leaves paid and chat');
ok(!(await save.saveEventRewards(get({ ev_bits_every: '0' }), 'events')).ok, 'events validation still refuses a bad number');

await save.saveEventRewards(get({ ev_shout_min: '4' }), 'shoutout');
s = await cur();
ok(!s.eventRewards.raidShoutout.on && s.eventRewards.raidShoutout.minViewers === 4, 'the shout-out save sets the shout-out (unticked is off)');
ok(s.eventRewards['gifted-subs'].on && s.eventRewards.bits.every === 700, 'the shout-out save leaves the four events');
ok(!(await save.saveEventRewards(get({ ev_shout_min: 'x' }), 'shoutout')).ok, 'shout-out validation still refuses a bad number');

await save.saveChat(get({ endOn: 'on', endText: 'Bye {top}' }), 'lines');
s = await cur();
ok(!s.chat.startOn && s.chat.endOn && s.chat.endText === 'Bye {top}', 'the start and end save sets both lines');
ok(s.chat.backup && s.chat.check, 'the start and end save leaves the Brie Bucks safety');

await save.saveChat(get({}), 'safety');
s = await cur();
ok(!s.chat.backup && !s.chat.check, 'the safety save sets both switches (unticked is off)');
ok(s.chat.endOn && s.chat.endText === 'Bye {top}', 'the safety save leaves the start and end lines');
ok(s.cost === 150 && s.eventRewards.bits.every === 700 && s.overlayWatchdog, 'the safety save leaves paid, events and the watchdog');

console.log('check-viewers-cards: ok');
