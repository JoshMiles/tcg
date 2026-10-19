// Checks the "show off a card" command on the server: ownership, version choice, serial, cooldown, queued event.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-showoff-server.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const kvLib = await import('../lib/kv');
const { encodeEntry } = await import('../lib/variants');
const { prepareShowOff } = await import('../lib/showoff-prepare');
const { kv } = await import('../lib/db');
const ser = await import('../lib/serials');

await kvLib.seedSeason1();
const pack = (await kvLib.getPack('pack1'))!;
await kvLib.savePack({ ...pack, upgradesEnabled: true } as never);
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const c = season.collectionName;
const cards = await kvLib.getPackCards('pack1');
const [a, b] = cards;
const clear = async (u: string) => { await kv.del(`showoff:cd:${u}`); };

await kvLib.saveCollection(c, { ann: [encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'shiny')] });
await ser.backfillSerials(c, await kvLib.getCollection(c));

await clear('ann'); await clear('nobody');
let r = await prepareShowOff('Ann', a.name);
ok(r.ok && r.plan.cardNumber === a.number && r.plan.variant === 'shiny', 'owned card, no version asked: the best owned version is shown');
ok(r.ok && r.plan.serial === 1, 'the lowest serial of that version is sent');
ok(r.ok && typeof r.plan.uid === 'number' && r.plan.uid === (await ser.getCopy(c, `${a.number}.3.1`))?.uid, 'the print number of that copy is sent too');
await clear('ann');
r = await prepareShowOff('ann', `regular ${a.name}`);
ok(r.ok && r.plan.variant === 'regular', 'asking for regular shows the regular');
r = await prepareShowOff('ann', a.name);
ok(!r.ok && r.error === 'cooldown', 'a second show-off straight away is refused');
await clear('ann');
r = await prepareShowOff('ann', b.name);
ok(!r.ok && r.error === 'not-owned', 'a card they do not own is refused');
r = await prepareShowOff('ann', b.name);
ok(!r.ok && r.error === 'not-owned', 'a refused request does not use up the cooldown');
r = await prepareShowOff('ann', '');
ok(r.ok && r.plan.variant === 'shiny', 'a bare command shows their best card');
await clear('ann');
await kvLib.saveCollection(c, { ann: [encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'shiny'), encodeEntry(b.number, 'regular')] });
await ser.backfillSerials(c, await kvLib.getCollection(c));
const regular = await ser.getCopy(c, `${a.number}.0.1`);
const other = await ser.getCopy(c, `${b.number}.0.1`);
ok(regular?.uid && other?.uid, 'the pinned and showcase prints have numbers');
const store = await import('../lib/user-settings-store');
await store.saveUserSettings('ann', { pinned: regular!.uid, showcaseUids: [other!.uid] });
r = await prepareShowOff('ann', '');
ok(r.ok && r.plan.uid === regular!.uid && r.plan.variant === 'regular', 'a pinned print wins over the showcase and the best card');
await clear('ann');
await store.saveUserSettings('ann', { pinned: null, showcaseUids: [other!.uid] });
r = await prepareShowOff('ann', '');
ok(r.ok && r.plan.uid === other!.uid && r.plan.cardNumber === b.number, 'with nothing pinned, the first showcase pick is shown');
await clear('ann');
await store.saveUserSettings('ann', { showcaseUids: [999_000_001] });
r = await prepareShowOff('ann', '', { dry: true });
ok(r.ok && r.plan.variant === 'shiny' && (await kv.get('showoff:cd:ann')) === null, 'a showcase print they do not hold falls back to the best card, and a dry run spends nothing');
await store.saveUserSettings('ann', { pinned: regular!.uid });
r = await prepareShowOff('ann', a.name, { dry: true });
ok(r.ok && r.plan.cardNumber === a.number && r.plan.variant === 'shiny', 'a named card ignores the pin');
await clear('ann');
r = await prepareShowOff('nobody', '');
ok(!r.ok, 'a viewer with no cards gets a refusal');
console.log('showoff server checks passed');
