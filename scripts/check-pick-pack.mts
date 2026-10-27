// Pick a pack (ROADMAP 55.4f): `!pack <name>` matching, the unknown_pack refusal (before anything is reserved), the pack opened, and the
// price per pack in the price order. Against the mock KV. Run: npx tsx scripts/check-pick-pack.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const c = await import('../lib/mixitup-core');
const m = await import('../lib/mixitup');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const { queuePull } = await import('../lib/pull-queue');
const { peekQueue, clearQueue } = await import('../lib/webhooks');
const { cleanPackInput, defaultPackInput } = await import('../lib/pack-clean');
const { SEED_PACK, SEED_CARDS, SEED_SEASON } = await import('../lib/seed');

// ── Matching (pure) ──
const names = [{ name: 'Base' }, { name: 'Jungle' }, { name: 'Jungle Deluxe' }, { name: 'Fossil' }];
ok(c.pickPack(names, 'base')?.name === 'Base' && c.pickPack(names, '  FOSSIL ')?.name === 'Fossil', 'an exact name matches in any case');
ok(c.pickPack(names, 'jungle')?.name === 'Jungle', 'an exact name wins over a longer name that starts with it');
ok(c.pickPack(names, 'fos')?.name === 'Fossil' && c.pickPack(names, 'JUNGLE D')?.name === 'Jungle Deluxe', 'a unique prefix matches');
ok(c.pickPack(names, 'jun') === null && c.pickPack(names, 'zzz') === null && c.pickPack(names, '') === null, 'an ambiguous prefix, an unknown name and nothing all match nothing');
ok(c.pickPack([{ name: 'Same' }, { name: 'same' }], 'SAME')?.name === 'Same', 'two exact matches: the first');
ok(c.cleanPackArg('  Base ') === 'Base' && c.cleanPackArg('') === '' && c.cleanPackArg(5) === '' && c.cleanPackArg(undefined) === '' && c.cleanPackArg('x'.repeat(100)).length === 60, 'the pack argument is trimmed, text only, 60 characters');
ok(/{packs}/.test(c.REPLY_DEFAULTS.unknown_pack) && c.REPLY_KEYS.includes('unknown_pack') && c.REPLY_VARS.includes('packs') && c.REPLY_LABELS.unknown_pack && c.REFUSAL_LABELS.unknown_pack, 'unknown_pack has a reply, a label and the {packs} placeholder');

// ── Price order (pure): pack, else role, else base; then happy hour ──
const s = { cost: 100, priceByRole: { subscriber: 30 } };
const T = Date.now();
const half = { kind: 'discount' as const, percent: 50, endsAt: T + 60_000, by: 't' };
ok(c.pullPrice(s, { role: 'regular', packPrice: 250 }) === 250, 'a pack price beats the base price');
ok(c.pullPrice(s, { role: 'subscriber', packPrice: 250 }) === 250 && c.pullPrice(s, { role: 'subscriber' }) === 30, 'a pack price beats a role price');
ok(c.pullPrice(s, { role: 'subscriber', packPrice: 250, happyHour: half, now: T }) === 125, 'a happy hour applies on top of the pack price');
ok(c.pullPrice(s, { role: 'subscriber', packPrice: undefined }) === 30 && c.pullPrice(s, { role: 'subscriber', packPrice: 0 }) === 30, 'no pack price (or 0) leaves the role price');

// ── The pack form (pure): whole number from 1, blank = none ──
const withPrice = (price: unknown) => cleanPackInput({ ...defaultPackInput('P'), price: price as number }).price;
ok(withPrice(40) === 40 && withPrice(40.9) === 40 && withPrice(0) === undefined && withPrice(-3) === undefined && withPrice(undefined) === undefined && withPrice('abc') === undefined, 'a pack price is a whole number from 1; anything else is none');

// ── A season with three packs that have cards and one without ──
const pack = (id: string, name: string, price?: number) => ({ ...SEED_PACK, id, name, ...(price ? { price } : {}) });
await kvLib.savePack(pack('pack1', 'Cheesy Starter Pack'));
await kvLib.savePackCards('pack1', SEED_CARDS);
await kvLib.savePack(pack('pack2', 'Cheesy Deluxe', 250));
await kvLib.savePackCards('pack2', SEED_CARDS.map(x => ({ ...x, id: `d${x.id}` })));
await kvLib.savePack(pack('pack3', 'Jungle', 40));
await kvLib.savePackCards('pack3', SEED_CARDS.map(x => ({ ...x, id: `j${x.id}` })));
await kvLib.savePack(pack('pack4', 'Empty'));
await kvLib.saveSeason({ ...SEED_SEASON, packIds: ['pack1', 'pack2', 'pack3', 'pack4'] });
const stored = await kvLib.getActiveSeasonWithPacks();
ok(stored?.packs.find(p => p.pack.id === 'pack2')?.pack.price === 250 && stored?.packs.find(p => p.pack.id === 'pack1')?.pack.price === undefined, 'the price is stored on the pack and read back');

const lastDraw = async () => { const q = await peekQueue(); return q[q.length - 1]?.draw?.packId; };
const pull = (name: string, o: Record<string, unknown> = {}) => queuePull(name, { free: true, chat: true, ...o });

// ── The pack opened ──
await clearQueue();
ok((await pull('amy', { pack: 'jungle' })).ok === true && (await lastDraw()) === 'pack3', 'an exact name (any case) opens that pack');
ok((await pull('amy', { pack: 'cheesy d' })).ok === true && (await lastDraw()) === 'pack2', 'a unique prefix opens that pack');
for (let i = 0; i < 20; i++) await pull('amy', { pack: 'Cheesy Starter Pack' });
ok((await peekQueue()).slice(2).every(e => e.draw?.packId === 'pack1'), 'asking for a pack always opens it, never another');
const before = (await peekQueue()).length;
const noPack = await pull('amy');
ok(noPack.ok === true && !noPack.ignored && (await peekQueue()).length === before + 1, 'no pack: the usual choice, unchanged');
ok((await pull('amy', { pack: '   ' })).ok === true && (await pull('amy', { pack: 7 })).ok === true && (await peekQueue()).length === before + 3, 'a blank pack (an empty $allargs) is no pack');

// ── Refused: unknown or ambiguous, before anything is reserved ──
const n = (await peekQueue()).length;
const amb = await pull('bob', { pack: 'cheesy' });
ok(amb.ignored === true && amb.reason === 'unknown_pack' && (await peekQueue()).length === n, `an ambiguous prefix is refused: ${JSON.stringify(amb)}`);
ok(/Cheesy Starter Pack, Cheesy Deluxe, Jungle\./.test(String(amb.message)) && !/Empty/.test(String(amb.message)) && /^bob,/.test(String(amb.message)), `the reply names the openable packs: ${amb.message}`);
const unk = await pull('bob', { pack: 'nothing' });
ok(unk.ignored === true && unk.reason === 'unknown_pack' && (await peekQueue()).length === n, 'an unknown name is refused');
ok((await pull('bob', { pack: 'Empty' })).reason === 'unknown_pack', 'a pack with no cards cannot be asked for');
await m.saveMixItUpSettings(c.normalizeMixItUp({ replies: { unknown_pack: '{username}: try {packs}' } }));
ok((await pull('bob', { pack: 'x' })).message === 'bob: try Cheesy Starter Pack, Cheesy Deluxe, Jungle', 'the reply text is editable');

// Paid: the refusal charges nothing, starts no cooldown, counts toward no limit (Mix It Up is never asked).
await m.saveMixItUpSettings(c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 1, cooldownSeconds: 30, secret: 's' }));
const paidNo = await queuePull('zed', { chat: true, pack: 'nothing' });
ok(paidNo.reason === 'unknown_pack' && (await kv.get('mixitup:cd:zed')) == null && (await kv.get('mixitup:pending:zed')) == null && (await m.pullsUsedThisStream('zed')) === 0, `a paid refusal reserved nothing: ${JSON.stringify(paidNo)}`);
ok((await m.getMixItUpLog()).some(e => e.what === 'refused' && /unknown_pack/.test(e.detail)), 'the refusal is in the log');
await m.saveMixItUpSettings(c.normalizeMixItUp({}));

// ── The price is charged: pack, else role, else base; happy hour on top ──
const balances: Record<string, number> = { pat: 1000 };
const fake: typeof fetch = async (_u, init) => new Response(JSON.stringify({ balance: balances[JSON.parse(String(init?.body)).username] ?? 0 }), { status: 200 });
const mix = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, priceByRole: { subscriber: 30 } });
const r0 = await m.reservePaidPull(mix, 'pat', 'k0', fake, 'regular');
const r1 = await m.reservePaidPull(mix, 'pat', 'k1', fake, 'regular', 250);
const r2 = await m.reservePaidPull(mix, 'pat', 'k2', fake, 'subscriber', 40);
ok(r0.price === 100 && r1.price === 250 && r2.price === 40, `no pack price: base; a pack price: that price, even over a role price: ${r0.price}, ${r1.price}, ${r2.price}`);
ok((await m.claimPaidPull('k1', 'pat'))?.amount === 250, 'the pack price is what is stored and charged');
const hh = await import('../lib/happyhour');
await hh.startHappyHour({ minutes: 30, kind: 'discount', percent: 50 }, 'amy');
ok((await m.reservePaidPull(mix, 'pat', 'k3', fake, 'regular', 250)).price === 125, 'a happy hour halves the pack price');
await hh.endHappyHour('amy');
balances.poor = 200;
const dear = await m.reservePaidPull(mix, 'poor', 'k4', fake, 'regular', 250);
ok(!dear.ok && dear.reason === 'insufficient_balance' && /costs 250/.test(dear.message), 'a viewer who cannot pay the pack price is refused with that price in the reply');

console.log('check-pick-pack: ok');
