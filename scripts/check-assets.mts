// Checks the admin Assets tools: what counts as unused (never a referenced file or a card's thumbnail), replacing a file,
// the fix guards, the insights maths and the unused-selection helpers.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-assets.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL_BLOB_RW_TOKEN;

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const kvLib = await import('../lib/kv');
const assets = await import('../lib/assets');
const fix = await import('../lib/asset-fix');
const ins = await import('../lib/asset-insights');

const HOST = 'https://abc123.public.blob.vercel-storage.com';
const UUID = '0123456789abcdef0123456789abcdef0123'.slice(0, 8) + '-aaaa-bbbb-cccc-0123456789ab';
const art = `${HOST}/cards/${UUID}.webp`, thumb = `${HOST}/cards/${UUID}.thumb.webp`;
const cover = `${HOST}/covers/cover.png`, orphan = `${HOST}/cards/orphan.webp`;

await kvLib.seedSeason1();
const packs = await kvLib.listAllPacks();
const pack = packs[0];
const cards = await kvLib.getPackCards(pack.id);
await kvLib.savePack({ ...pack, coverImageUrl: cover });
await kvLib.savePackCards(pack.id, cards.map((c, i) => (i === 0 || i === 1 ? { ...c, imageUrl: art } : i === 2 ? { ...c, imageUrl: `${HOST}/cards/legacy.gif` } : c)));

// ── what is referenced / deletable ──
const { referenced } = await assets.collectReferenced();
ok(referenced.has(art) && referenced.has(cover), 'card art and cover are referenced');
ok(referenced.has(thumb), "a card's companion thumbnail counts as referenced");
const inStore = new Set([art, thumb, cover, orphan, `${HOST}/cards/legacy.gif`]);
eq(assets.pickDeletable([art, thumb, cover, orphan, orphan, 'https://evil.example/x.png', `${HOST}/cards/not-there.webp`], inStore, referenced), [orphan], 'only unreferenced files in our store can be deleted (and only once)');
eq(await assets.deleteUnusedBlobs([art, cover]), 0, 'no Blob token: nothing is deleted');

// ── the library: ids, sharing, flags ──
const lib = await assets.loadAssetLibrary('http://localhost:1');
const ids = lib.assets.map(a => a.id);
eq(new Set(ids).size, ids.length, 'every reference has a unique id');
const first = lib.assets.find(a => a.url === art)!;
ok(first.sharedWith.length === 1, 'two cards pointing at one file know they share it');
ok(lib.assets.find(a => a.url.endsWith('legacy.gif'))!.issues.includes('legacy-gif'), 'a GIF is flagged');

// ── replace ──
const key = assets.keyOf(first.origin, 'card-art');
ok(!(await fix.replaceAsset(key, 'https://evil.example/x.webp')).ok, 'an arbitrary URL is refused');
ok(!(await fix.replaceAsset(key, `${HOST}/sounds/a.mp3`)).ok, 'a sound cannot replace card art');
ok(!(await fix.replaceAsset({ kind: 'sound', packId: pack.id, cardId: first.origin.kind === 'pack-cover' ? undefined : first.origin.cardId }, `${HOST}/x.png`)).ok, 'an image cannot replace a sound');
const newArt = `${HOST}/cards/${UUID.replace('0123', 'ffff')}.webp`;
ok((await fix.replaceAsset(key, newArt)).ok, 'a Blob image replaces card art');
const after = await kvLib.getPackCards(pack.id);
eq([after[0].imageUrl, after[1].imageUrl], [newArt, art], 'only the chosen card changed (the shared file is untouched)');
ok((await fix.replaceAsset({ kind: 'pack-cover', packId: pack.id }, '/assets/pack-cover.png')).ok, 'a bundled file can be a cover');
eq((await kvLib.getPack(pack.id))?.coverImageUrl, '/assets/pack-cover.png', 'the cover changed');
ok(!(await fix.replaceAsset({ kind: 'card-art', packId: 'nope', cardId: 'x' }, art)).ok, 'an unknown card is refused');

// ── fix guards ──
ok(!(await fix.fixAsset({ kind: 'sound', packId: pack.id, cardId: after[0].id }, 'http://localhost:1')).ok, 'sounds are never auto-fixed');
const noToken = await fix.fixAsset(assets.keyOf(lib.assets.find(a => a.url.endsWith('legacy.gif'))!.origin, 'card-art'), 'http://localhost:1');
ok(!noToken.ok && /not connected/i.test(noToken.message), 'fixing needs Blob storage');

// ── insights + selection helpers ──
const i = ins.computeInsights([
  { ...first, bytes: 100, format: 'WebP' }, { ...first, id: 'b', bytes: 900, format: 'GIF', sharedWith: [] }, { ...first, id: 'c', bytes: null, format: 'PNG', kind: 'pack-cover', sharedWith: [] },
]);
eq([i.totalBytes, i.gifs.files, i.gifs.bytes, i.unknownSize], [1000, 1, 900, 1], 'insights totals');
eq(i.gifs.estimatedSaved, Math.round(900 * ins.GIF_SAVINGS), 'GIF savings estimate');
eq(i.heaviest[0].bytes, 900, 'heaviest first');
const day = 86_400_000, now = Date.now();
const old = [{ uploadedAt: new Date(now - 40 * day).toISOString() }, { uploadedAt: new Date(now - 3 * day).toISOString() }];
eq([ins.olderThan(old, 30, now).length, ins.olderThan(old, 90, now).length, ins.olderThan(old, 1, now).length], [1, 0, 2], 'older-than filter');

console.log('assets: all checks passed');
