// Checks the admin Users tools: tags, restrictions (hidden board, trade block), restore points and merging.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-users.mts
import { readFileSync } from 'node:fs';
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const admin = await import('../lib/user-admin');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
const audit = await import('../lib/audit');
const { prodKv, runInSandbox } = await import('../lib/db');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number) => encodeEntry(n, 'regular');

// Pure
eq(admin.cleanTags(['VIP', ' vip ', 'Bad!!Chars', 'x'.repeat(40), '']), ['vip', 'badchars', 'x'.repeat(20)], 'tags are normalised and de-duplicated');
ok(admin.cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length === admin.MAX_TAGS, 'tag count is capped');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Users check', source: 'config' });
const prodHidden = async () => JSON.stringify([await prodKv.get('users:hidden'), await prodKv.smembers('users:hidden:admin')]);
const prodBefore = await prodHidden();

await runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  await kvLib.saveCollection(coll, { alice: [E(1), E(1), E(2)], bob: [E(3), E(4)], carol: [E(9)] });
  await trades.saveTradeSettings({ enabled: true, expiryHours: 48, maxOpenPerUser: 5, cooldownSeconds: 0, maxStacksPerSide: 8 });
  const stack = (cardNumber: number, count = 1) => ({ cardNumber, variant: 'regular' as const, count });

  // Tags
  const tagged = await admin.saveTags('alice', ['VIP', 'watch']);
  ok(tagged.ok && JSON.stringify(tagged.tags) === JSON.stringify(['vip', 'watch']), 'tags saved');
  eq((await kvLib.getUserProfile('alice'))?.tags, ['vip', 'watch'], 'tags persisted on the profile');

  // Restrictions
  await admin.saveFlags('bob', { noTrading: true, hideFromBoard: true, reason: 'testing' });
  ok((await admin.getHiddenUsers()).has('bob'), 'bob is in the hidden set');
  ok(await admin.isTradeBlocked('bob'), 'bob is trade-blocked');
  const toBob = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(1)], get: [stack(3)] });
  ok(!toBob.ok, 'nobody can offer a trade to a blocked viewer');
  const fromBob = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'listing', give: [stack(3)], get: [stack(1)] });
  ok(!fromBob.ok, 'a blocked viewer cannot make offers');
  ok((await kvLib.getCollection(coll)).alice.length === 3, 'a refused offer takes nothing from the offerer');
  await admin.saveFlags('bob', { noTrading: false, hideFromBoard: false });
  ok(!(await admin.getHiddenUsers()).has('bob'), 'clearing the restriction un-hides');

  // Restore points: reset, then restore
  const snap = await admin.takeUserSnapshot('alice', 'Before test reset');
  ok(!!snap && snap.collections[0].entries.length === 3, 'a restore point holds the cards');
  await kvLib.removeUserFromCollection(coll, 'alice');
  ok(!(await kvLib.getCollection(coll)).alice, 'alice was reset');
  const restored = await admin.restoreUserSnapshot('alice', snap!.id);
  ok(restored.ok && restored.cards === 3, 'restore reports the cards');
  eq((await kvLib.getCollection(coll)).alice, [E(1), E(1), E(2)], 'restore brings every copy back');
  ok((await admin.listUserSnapshots('alice')).length >= 2, 'restoring itself leaves a restore point');

  // A reset waits for the collection lock, so it cannot overwrite a pull that lands mid-write
  let reset!: Promise<boolean>;
  await kvLib.withCollectionLock(coll, async () => {
    reset = kvLib.removeUserFromCollection(coll, 'carol');
    await new Promise(r => setTimeout(r, 300));
    ok((await kvLib.getCollection(coll)).carol, 'a reset does not write while the collection is locked');
  });
  ok(await reset, 'the reset runs once the lock is free');
  await kvLib.saveCollection(coll, { ...(await kvLib.getCollection(coll)), carol: [E(9)] });
  ok(!(await admin.restoreUserSnapshot('alice', 'nope')).ok, 'an unknown restore point is refused');

  // Merge
  const merged = await admin.mergeUsers('carol', 'bob');
  ok(merged.ok && merged.cards === 1, 'merge moves the cards');
  const after = await kvLib.getCollection(coll);
  eq(after.bob, [E(3), E(4), E(9)], 'bob now has carol\'s cards too');
  ok(!after.carol, 'carol is gone from the collection');
  ok(!(await admin.mergeUsers('bob', 'bob')).ok, 'merging into yourself is refused');

  // Merge refused while a trade is open
  const open = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'listing', give: [stack(2)], get: [stack(4)] });
  ok(open.ok, 'a listing can be made');
  ok(!(await admin.mergeUsers('alice', 'bob')).ok, 'merge is refused while the viewer has an open offer');
  ok((await kvLib.getCollection(coll)).alice.length === 2, 'a refused merge changes nothing');

  // Audit
  await audit.recordAudit('alice', 'Test', 'detail');
  ok((await audit.getUserAudit('alice')).some(a => a.action === 'Test'), 'audit entries are readable');

  // Numbered restore puts the same prints back, and refuses while an offer is open or a print has moved on.
  const serials = await import('../lib/serials');
  const { kv } = await import('../lib/db');
  await kvLib.saveCollection(coll, { ...(await kvLib.getCollection(coll)), dave: [E(1), E(1), E(2)] });
  await serials.backfillSerials(coll, await kvLib.getCollection(coll));
  const beforeIds = (await serials.getOwnerCopies(coll, 'dave')).map(c => c.id).sort();
  const minted = (await serials.serialStats(coll)).minted;
  ok(beforeIds.length === 3, 'dave\'s prints are numbered');
  const snapN = await admin.takeUserSnapshot('dave', 'Before numbered reset');
  ok(snapN?.collections[0]?.prints?.length === 3, 'a numbered restore point stores the print ids');
  await kvLib.removeUserFromCollection(coll, 'dave');
  ok((await serials.getOwnerCopies(coll, 'dave')).length === 0, 'reset retires dave\'s prints');
  const backN = await admin.restoreUserSnapshot('dave', snapN!.id);
  ok(backN.ok && backN.cards === 3, 'numbered restore reports the cards: ' + (backN.ok ? '' : backN.error));
  eq((await serials.getOwnerCopies(coll, 'dave')).map(c => c.id).sort(), beforeIds, 'the same prints come back');
  ok((await serials.serialStats(coll)).minted === minted, 'restore does not mint a second set');

  const listed = await trades.createTrade({ seasonId: season.id, from: 'dave', kind: 'listing', give: [{ cardNumber: 2, variant: 'regular', count: 1 }], get: [{ cardNumber: 3, variant: 'regular', count: 1 }] });
  ok(listed.ok, 'dave lists a print');
  const during = await admin.restoreUserSnapshot('dave', snapN!.id);
  ok(!during.ok && /open trade/.test(during.error), 'restore is refused while an offer is open');
  ok((await serials.serialStats(coll)).minted === minted, 'a refused restore mints nothing');
  if (listed.ok) ok((await trades.cancelTrade(listed.trade.id, 'dave')).ok, 'the listing is cancelled');
  eq((await serials.getOwnerCopies(coll, 'dave')).map(c => c.id).sort(), beforeIds, 'cancelling returns the same print');

  const bare = await admin.takeUserSnapshot('dave', 'Without print ids');
  const stored = await kv.get<NonNullable<typeof bare>>(`user:dave:snap:${bare!.id}`);
  ok(!!stored, 'the id-less point can be rewritten');
  if (stored) {
    for (const c of stored.collections) delete c.prints;
    await kv.set(`user:dave:snap:${bare.id}`, stored);
  }
  await kvLib.removeUserFromCollection(coll, 'dave');
  const revived = await admin.restoreUserSnapshot('dave', bare!.id);
  ok(revived.ok, 'an older restore point with no print ids still restores: ' + (revived.ok ? '' : revived.error));
  eq((await serials.getOwnerCopies(coll, 'dave')).map(c => c.id).sort(), beforeIds, 'removed prints are revived instead of minted');
  ok((await serials.serialStats(coll)).minted === minted, 'reviving does not mint');

  const away = await trades.createTrade({ seasonId: season.id, from: 'dave', kind: 'direct', to: 'bob', give: [{ cardNumber: 2, variant: 'regular', count: 1 }], get: [{ cardNumber: 3, variant: 'regular', count: 1 }] });
  ok(away.ok && (await trades.acceptTrade(away.trade.id, 'bob')).ok, 'bob takes one of dave\'s prints');
  const moved = await admin.restoreUserSnapshot('dave', snapN!.id);
  ok(!moved.ok && /held by @bob/.test(moved.error), 'restore is refused when a saved print has moved on: ' + (moved.ok ? '' : moved.error));
  ok((await serials.serialStats(coll)).minted === minted, 'the refused restore still mints nothing');
  ok((await serials.getOwnerCopies(coll, 'bob')).some(c => beforeIds.includes(c.id)), 'bob keeps the print');
});

// The profile form never writes the Twitch ID (sign-in binds it, ROADMAP 47.8): the action does not read or set it.
const saveAction = readFileSync(new URL('../app/admin/actions/users.ts', import.meta.url), 'utf8');
const saveProfile = saveAction.slice(saveAction.indexOf('export async function updateUserProfile'), saveAction.indexOf('// Remove one instance'));
ok(saveProfile.includes('...existing') && !/twitchId/i.test(saveProfile), 'updateUserProfile keeps the stored twitchId and never reads or writes it');

ok((await prodHidden()) === prodBefore, 'production hidden set untouched by the sandbox');
await sbx.deleteSandbox(box.id);
console.log('check-users: all checks passed');
