// Checks GET /api/twitch/collection: draft seasons never appear, a public profile answers without a token, and a private profile
// returns its cards only to that viewer's extension token (anyone else gets the same shape with no collections).
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local. Runs in the extension's dev mode (no TWITCH_EXTENSION_SECRET),
// where any bearer maps through the opaque id `dev_mock_opaque`.
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
delete process.env.TWITCH_EXTENSION_SECRET;
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const sbx = await import('../lib/sandbox');
const db = await import('../lib/db');
const settings = await import('../lib/user-settings-store');
const route = await import('../app/api/twitch/collection/route');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Panel collection check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  await kvLib.setActiveSeason(season.id);
  const [a] = await kvLib.getPackCards('pack1');
  const draft = { ...season, id: 'draft-x', name: 'Draft X', collectionName: 'collection_draft_x', status: 'draft' as const, active: false };
  await kvLib.saveSeason(draft);
  const entry = encodeEntry(a.number, 'regular');
  await kvLib.saveCollection(season.collectionName, { alice: [entry], bob: [entry, entry] });
  await kvLib.saveCollection(draft.collectionName, { alice: [entry], bob: [entry] });
  await settings.saveUserSettings('bob', { privateProfile: true });
  await kv.set('users:hidden', ['carol']); // hidden by an admin, with no private-profile setting of their own

  const get = async (username: string, token?: string) => {
    const res = await route.GET(new NextRequest('http://localhost/api/twitch/collection?username=' + username, { headers: token ? { authorization: 'Bearer ' + token } : {} }));
    return { status: res.status, body: await res.json() };
  };

  // Public profile: cards without a token (old panels), drafts dropped.
  const pub = await get('alice');
  ok(pub.status === 200 && pub.body.username === 'alice', 'public profile answers without a token');
  ok(pub.body.collections.length === 1 && pub.body.collections[0].ownedNumbers.length === 1, 'public profile gets its cards');
  ok(!pub.body.collections.some((c: { seasonId: string }) => c.seasonId === 'draft-x'), 'draft seasons never appear');

  // Private profile: nothing without a token, nothing for another viewer, cards for the viewer.
  await kv.set('twitch_opaque:dev_mock_opaque', 'alice');
  const none = await get('bob');
  ok(none.status === 200 && none.body.username === 'bob' && none.body.collections.length === 0, 'private profile without a token gets no cards');
  const other = await get('bob', 'x');
  ok(other.status === 200 && other.body.collections.length === 0, 'private profile for another viewer gets no cards');
  await kv.set('twitch_opaque:dev_mock_opaque', 'bob');
  const own = await get('bob', 'x');
  ok(own.body.collections.length === 1 && own.body.collections[0].ownedNumbers.length === 2, 'private profile with that viewer\'s token gets its cards');
  await kvLib.saveCollection(season.collectionName, { alice: [entry], bob: [entry, entry], carol: [entry] });
  const hiddenNone = await get('carol');
  ok(hiddenNone.status === 200 && hiddenNone.body.collections.length === 0, 'an admin-hidden viewer gets no cards for another caller');
  await kv.set('twitch_opaque:dev_mock_opaque', 'carol');
  ok((await get('carol', 'x')).body.collections.length === 1, 'an admin-hidden viewer still gets their own cards');
  ok(!own.body.collections.some((c: { seasonId: string }) => c.seasonId === 'draft-x'), 'draft seasons never appear for the owner either');
});
console.log('ok: panel collection');
