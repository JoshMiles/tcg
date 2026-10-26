// Checks what Admin > Assets calls "unused": every kind of file the app stores must count as in use, backups are never a candidate,
// and only a truly orphaned file is selected for deletion. The Blob listing is faked; the real Blob API is never called.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-assets-unused.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.VERCEL_BLOB_RW_TOKEN;

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const assets = await import('../lib/assets');
const ins = await import('../lib/asset-insights');
const back = await import('../lib/card-back');
const backEdit = await import('../lib/card-back-edit');
const backStore = await import('../lib/card-back-store');

const HOST = 'https://abc123.public.blob.vercel-storage.com';
const u = (path: string) => `${HOST}/${path}`;
const U1 = '0123456789abcdef0123456789abcdef0123'.slice(0, 8) + '-aaaa-bbbb-cccc-0123456789ab';
const U2 = '0123456789abcdef0123456789abcdef0123'.slice(0, 8) + '-aaaa-bbbb-cccc-0123456789cd';
const art = u(`cards/${U1}.webp`), artThumb = u(`cards/${U1}.thumb.webp`);
const fullArt = u(`cards/${U2}.webp`), fullArtThumb = u(`cards/${U2}.thumb.webp`);
const still = u('cards/x.still-3.webp'), fullArtStill = u('cards/y.still-1.webp');
const cover = u('covers/cover.webp'), sound = u('sounds/pull.mp3');
const backLogo = u('logos/back-logo.png'), backImage = u('backs/back-image.png');
const layerImage = u('overlay/layer.png'), sceneImage = u('overlay/scene.png'), versionImage = u('overlay/old-version.png'), packLayerImage = u('overlay/pack.png');
const backup = u('backups/2026-10-01.json.gz.enc');
const orphan = u('cards/orphan.webp');

// ── seed one of each kind of stored file ──
await kvLib.seedSeason1();
const pack = (await kvLib.listAllPacks())[0];
const cards = await kvLib.getPackCards(pack.id);
await kvLib.savePack({ ...pack, coverImageUrl: cover });
await kvLib.savePackCards(pack.id, cards.map((c, i) => (i === 0 ? { ...c, imageUrl: art, soundUrl: sound, stillUrl: still, fullArtImageUrl: fullArt, fullArtStillUrl: fullArtStill } : c)));

// A card back with an image and a logo.
let style = back.DEFAULT_CARD_BACK;
const withImage = backEdit.addMedia(style, 'image', { x: 10, y: 10, w: 80, h: 80 })!;
const withLogo = backEdit.addMedia(withImage.style, 'image', { x: 100, y: 10, w: 40, h: 40 })!;
style = backEdit.patchElements(backEdit.patchElements(withLogo.style, [withImage.id], { url: backImage }), [withLogo.id], { url: backLogo });
await backStore.saveCardBack(pack.id, style);
ok((await backStore.getCardBack(pack.id))?.elements.some(e => e.url === backImage), 'the card back design kept its image (test setup)');

// Overlay Editor: a layer image in the live layout, a pack look, a scene and an old saved version.
const layer = (id: string, imageUrl: string) => ({ id, kind: 'image', name: id, x: 0, y: 0, w: 100, h: 100, url: imageUrl, fit: 'contain' });
await kv.set('overlay:settings', { layout: { custom: [layer('a', layerImage)] } });
await kv.set('overlay:packprops', { [pack.id]: { 'show.customSound': packLayerImage } });
await kv.set('overlay:presets', [{ id: 's1', name: 'Scene', props: {}, layout: { custom: [layer('b', sceneImage)] }, updatedAt: 1 }]);
await kv.set('overlay:versions', [{ id: 'v1', at: 1, note: 'old', layout: { custom: [layer('c', versionImage)] }, props: {}, packs: {} }]);

// ── everything the app stores counts as referenced ──
const { referenced } = await assets.collectReferenced();
for (const [what, file] of [
  ['card art', art], ['its thumbnail', artThumb], ['card sound', sound], ['still frame', still], ['full art still', fullArtStill],
  ['full art image', fullArt], ['full art thumbnail', fullArtThumb], ['pack cover', cover],
  ['card back image', backImage], ['card back logo', backLogo],
  ['overlay layer image', layerImage], ['overlay pack file', packLayerImage], ['scene layer image', sceneImage], ['saved overlay version image', versionImage],
] as const) ok(referenced.has(file), `${what} counts as in use`);
ok(!referenced.has(orphan), 'a file nothing points at is not referenced');

// ── the fake Blob listing: all of the above, a backup and one orphan ──
const old = new Date(Date.now() - 40 * 86_400_000);
const listing = [art, artThumb, sound, still, fullArtStill, fullArt, fullArtThumb, cover, backImage, backLogo, layerImage, packLayerImage, sceneImage, versionImage, backup, orphan]
  .map(file => ({ url: file, pathname: new URL(file).pathname.slice(1), size: 1000, uploadedAt: old }));
const unused = assets.unusedFrom(listing, referenced);
eq(unused.map(f => f.url), [orphan], 'only the orphaned file is listed as unused');
ok(assets.isProtectedUrl(backup) && !assets.isProtectedUrl(orphan), 'backups are protected');

// Bulk delete picks: even when the form asks for everything, and even if a backup looked unreferenced.
const inStore = new Set(listing.map(f => f.url));
eq(assets.pickDeletable(listing.map(f => f.url), inStore, referenced), [orphan], 'asking to delete everything only deletes the orphan');
eq(assets.pickDeletable([backup], inStore, new Set()), [], 'a backup is never deleted, even when nothing references it');

// ── the confirm step's breakdown ──
const groups = ins.groupUnused([
  { pathname: 'cards/a.webp', format: 'WebP', bytes: 300 }, { pathname: 'cards/b.webp', format: 'WebP', bytes: 200 },
  { pathname: 'sounds/a.mp3', format: 'MP3', bytes: 900 }, { pathname: 'loose.png', format: 'PNG', bytes: 10 },
]);
eq(groups, [{ folder: 'sounds/', format: 'MP3', files: 1, bytes: 900 }, { folder: 'cards/', format: 'WebP', files: 2, bytes: 500 }, { folder: '(top level)', format: 'PNG', files: 1, bytes: 10 }], 'unused files are grouped by folder and kind, with counts and sizes');

console.log('check-assets-unused: ok');
