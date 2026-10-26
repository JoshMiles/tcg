// Input checks at the trust boundary (ROADMAP 46.7): incoming webhooks refuse a username that is not a Twitch login and a
// card number that is not in the active season, a trainer card can only be used in a published season that has not ended,
// and a whole-collection replace body must be usernames to lists of valid entries.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local. Run: npx tsx scripts/check-input-checks.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const webhooks = await import('../lib/webhooks');
const buffs = await import('../lib/buffs');
const grant = await import('../app/api/webhooks/grant-card/route');
const collectionHook = await import('../app/api/webhooks/collection/route');
const { encodeEntry, parseCollectionData } = await import('../lib/variants');

await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const c = season.collectionName;
const cards = await kvLib.getPackCards('pack1');
const real = cards[0].number;

// ── incoming webhooks ──
const secret = (await webhooks.getWebhookSettings()).incomingSecret;
const post = (route: { POST: (r: NextRequest) => Promise<Response> }, body: Record<string, unknown>) =>
  route.POST(new NextRequest('http://localhost/api/webhooks/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret, ...body }) }));
const held = async (u: string) => (await kvLib.getCollection(c))[u] ?? [];

for (const bad of ['', 'ab', 'x'.repeat(26), 'has space', 'a/b', 'a;b', 5, null]) {
  const r = await post(grant, { username: bad, cardNumber: real });
  ok(r.status === 400, `grant-card refuses the username ${JSON.stringify(bad)}`);
}
ok((await post(collectionHook, { username: 'not a login' })).status === 400, 'another incoming webhook refuses a bad username too');
ok((await post(collectionHook, { username: 'viewer_1' })).status === 200, 'the collection webhook accepts a real login');
ok(Object.keys(await kvLib.getCollection(c)).length === 0, 'a refused webhook writes nothing');

const unknownCard = await post(grant, { username: 'viewer_1', cardNumber: 987654 });
ok(unknownCard.status === 404 && (await held('viewer_1')).length === 0, 'a card number not in the active season is refused and nothing is granted');

const granted = await post(grant, { username: '@Viewer_1', cardNumber: real });
ok(granted.status === 200, 'a real card is granted');
ok((await held('viewer_1')).length === 1 && (await held('viewer_1'))[0] === encodeEntry(real, 'regular'), 'the grant is stored under the cleaned login');

// ── trainer cards: published, not ended ──
await buffs.upsertBuffDef({ id: 'ic-pk', name: 'Pack Surge', type: 'extra-pack', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'self' });
const trainerNo = Math.max(...cards.map(x => x.number)) + 1;
await kvLib.savePackCards('pack1', [...cards, { id: 'ic-c', number: trainerNo, name: 'Input Coach', imageUrl: '/a/t.png', probability: 5, stars: 3, kind: 'trainer', buffId: 'ic-pk' }]);
const T = encodeEntry(trainerNo, 'regular');
const draft = { ...season, id: 'ic-draft', collectionName: 'IcDraft', status: 'draft' as const, active: false };
const ended = { ...season, id: 'ic-ended', collectionName: 'IcEnded', active: false, endedAt: 1_700_000_000_000 };
await kvLib.saveSeason(draft);
await kvLib.saveSeason(ended);
for (const name of [c, draft.collectionName, ended.collectionName]) await kvLib.saveCollection(name, { alice: [T, T, T] });
const count = async (name: string) => ((await kvLib.getCollection(name)).alice ?? []).filter(e => e === T).length;

for (const [label, id] of [['a draft season', draft.id], ['an ended season', ended.id], ['an unknown season', 'nope']] as const) {
  const r = await buffs.useTrainerCard('alice', trainerNo, id);
  ok(!r.ok && r.status === 400, `${label} is refused`);
}
ok(await count(draft.collectionName) === 3 && await count(ended.collectionName) === 3, 'a refused season spends nothing');
const used = await buffs.useTrainerCard('alice', trainerNo, season.id);
ok(used.ok && await count(c) === 2, 'the published, open season works');
await kvLib.setActiveSeason();
const noneActive = await buffs.useTrainerCard('alice', trainerNo);
ok(!noneActive.ok && noneActive.status === 400 && await count(c) === 2, 'with no season given and none active, nothing falls back to the first season');

// ── whole-collection replace body ──
const good = { alice: [1, 2, encodeEntry(3, 'shiny')], bob: [] };
const parsed = parseCollectionData(good);
ok(parsed.ok && parsed.data.alice.length === 3, 'a valid body passes');
for (const [label, body] of [
  ['null', null], ['an array', []], ['a string', 'x'], ['a bad username', { 'Not A Login': [1] }], ['an upper-case username', { Alice: [1] }],
  ['a non-list', { alice: 5 }], ['a string entry', { alice: ['1'] }], ['a fraction', { alice: [1.5] }], ['zero', { alice: [0] }],
  ['a negative', { alice: [-3] }], ['a variant with no card', { alice: [1_000_000] }], ['an unknown variant', { alice: [5_000_001] }], ['a null entry', { alice: [null] }],
] as const) ok(!parseCollectionData(body).ok, `the body is refused: ${label}`);

console.log('input checks passed');
