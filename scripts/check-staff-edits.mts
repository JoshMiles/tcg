// Staff edits to a viewer (mod-panel audit L-7 and L-8): unknown names are refused, and the hidden list, tags and restrictions
// are saved without two staff edits (or an edit and a sign-in) overwriting each other. Runs saves in parallel, which the old
// read-modify-write code lost.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-staff-edits.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const admin = await import('../lib/user-admin');
const kvLib = await import('../lib/kv');
const { prodKv } = await import('../lib/db');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const coll = (await kvLib.listSeasons())[0].collectionName;

// ── L-7: unknown viewers are refused and nothing is created ──
for (const bad of ['ghost_nobody', 'no such name!', '', '@']) {
  const t = await admin.saveTags(bad, ['vip']);
  const f = await admin.saveFlags(bad, { noTrading: false, hideFromBoard: true, reason: 'x' });
  ok(!t.ok && !f.ok, `"${bad}" is refused`);
  ok(!t.ok && /don't know that viewer/.test(t.error), 'the message says why');
}
ok(!(await kvLib.getUserProfile('ghost_nobody')), 'no profile was made for an unknown name');
ok(!(await admin.getHiddenUsers()).has('ghost_nobody'), 'an unknown name was not hidden');

// A viewer with cards but no profile is known; the name is cleaned (@, case).
await kvLib.saveCollection(coll, { cardonly: [encodeEntry(1, 'regular')] });
const viaCards = await admin.saveTags('@CardOnly', ['VIP']);
ok(viaCards.ok && viaCards.tags.join() === 'vip', 'a viewer with cards only can be tagged');
ok((await kvLib.getUserProfile('cardonly'))?.tags?.join() === 'vip', 'their profile now exists with the tag');

// ── L-8: parallel saves all land ──
const names = Array.from({ length: 8 }, (_, i) => `viewer${i}`);
for (const n of names) await kvLib.saveUserProfile({ username: n, displayName: n, createdAt: 1 });

await Promise.all(names.map(n => admin.saveFlags(n, { noTrading: false, hideFromBoard: true, reason: 'r' })));
const hidden = await admin.getHiddenUsers();
ok(names.every(n => hidden.has(n)), `all ${names.length} parallel hides are kept (${[...hidden].join()})`);

await Promise.all(names.slice(0, 4).map(n => admin.saveFlags(n, { noTrading: false, hideFromBoard: false })));
const after = await admin.getHiddenUsers();
ok(names.slice(0, 4).every(n => !after.has(n)) && names.slice(4).every(n => after.has(n)), 'parallel un-hides remove only their own viewer');

// Tags, restrictions and a sign-in backfill on the same profile, all at once, all kept.
const racers = Array.from({ length: 8 }, (_, i) => `racer${i}`);
for (const n of racers) await kvLib.saveUserProfile({ username: n, displayName: n, createdAt: 1 });
await Promise.all(racers.flatMap(n => [
  admin.saveTags(n, ['watch']),
  admin.saveFlags(n, { noTrading: true, hideFromBoard: false, reason: 'why' }),
  kvLib.ensureUserProfile(n, '4242'),
]));
for (const n of racers) {
  const p = await kvLib.getUserProfile(n);
  ok(p?.tags?.join() === 'watch' && p.flags?.noTrading === true && p.twitchId === '4242', `${n} kept the tag, the restriction and the Twitch ID: ${JSON.stringify(p)}`);
}

// ── Old data: the hidden list used to be one JSON array under `users:hidden` ──
await prodKv.del('users:hidden:admin');
await prodKv.set('users:hidden', ['old1', 'old2']);
ok((await admin.getHiddenUsers()).has('old1'), 'an old-shape hidden list is still read');
await kvLib.saveUserProfile({ username: 'newone', displayName: 'newone', createdAt: 1 });
await admin.saveFlags('newone', { noTrading: false, hideFromBoard: true });
const merged = await admin.getHiddenUsers();
ok(['old1', 'old2', 'newone'].every(n => merged.has(n)), 'hiding moves the old list across and keeps it');
ok(!(await prodKv.exists('users:hidden')), 'the old key is gone once folded in');
await admin.setHidden('old1', false);
const last = await admin.getHiddenUsers();
ok(!last.has('old1') && last.has('old2') && last.has('newone'), 'showing one viewer leaves the rest');

console.log('check-staff-edits: all checks passed');
