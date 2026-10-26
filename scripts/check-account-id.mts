// Checks the Twitch account ID bookkeeping at sign-in: the classification, the `acct:ids` index, moving a conflicting profile aside,
// following a Twitch rename, the earlier-collection offer and the recorded conflicts.
// Needs the mock KV (node scripts/mock-kv.cjs) with KV_REST_API_URL / KV_REST_API_TOKEN pointing at it.
// Run: npx tsx scripts/check-account-id.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { classifySignIn } = await import('../lib/account-id');
const { bindAccount, listAccountConflicts } = await import('../lib/account-bind');
const { kv, runInSandbox } = await import('../lib/db');
const { getUserProfile, saveUserProfile, saveCollection, getCollection, listSeasons, seedSeason1 } = await import('../lib/kv');
const { listAsideAccounts, moveAccount, declineAside, listUnfinishedMoves } = await import('../lib/account-move');
const { findEarlierAccount } = await import('../lib/account-restore');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number) => encodeEntry(n, 'regular');
const { loadDataHealth } = await import('../lib/data-health');

// ── the classification table ──
const p = (twitchId?: unknown) => ({ username: 'sam', displayName: 'sam', twitchId, createdAt: 1 });
ok(classifySignIn(null, '5') === 'new' && classifySignIn(undefined, '5') === 'new', 'no profile is new');
ok(classifySignIn(p(), '5') === 'claim', 'a profile with no ID is claimed');
ok(classifySignIn(p('Sam the Great'), '5') === 'claim', 'free text in twitchId counts as no ID');
ok(classifySignIn(p(''), '5') === 'claim', 'an empty twitchId counts as no ID');
ok(classifySignIn(p('5'), '5') === 'same', 'the same ID is same');
ok(classifySignIn(p('5'), '6') === 'conflict', 'a different ID is a conflict');
ok(classifySignIn(p('5'), undefined) === 'same' && classifySignIn(p(), 'abc') === 'same', 'a sign-in with no usable ID never claims or conflicts');
ok(classifySignIn(null, undefined) === 'new', 'no profile and no ID is still new');

// ── bindAccount ──
ok(await bindAccount('Newbie', '11') === 'new', 'a first sign-in is new');
let prof = await getUserProfile('newbie');
ok(prof?.twitchId === '11' && prof.username === 'newbie', 'the new profile holds the ID, under the lower-case login');
ok(await kv.hget('acct:ids', '11') === 'newbie', 'acct:ids maps the ID to the login');

ok(await bindAccount('newbie', '11') === 'same', 'signing in again is same');
ok((await listAccountConflicts()).length === 0, 'no conflict so far');

await saveUserProfile(p('free text from the admin form') as never);
ok(await bindAccount('sam', '22') === 'claim', 'a profile with a non-numeric value is claimed');
ok((await getUserProfile('sam'))?.twitchId === '22', 'the claim writes the ID over the text');
ok(await kv.hget('acct:ids', '22') === 'sam', 'the claim is indexed');

await saveUserProfile({ username: 'old', displayName: 'Old One', createdAt: 5 } as never);
ok(await bindAccount('old', '33') === 'claim', 'a profile with no ID at all is claimed');
ok((await getUserProfile('old'))?.displayName === 'Old One', 'the claim keeps the rest of the profile');

// ── the same Twitch account under a new login (a Twitch rename): the profile follows it when the new login is blank ──
ok(await bindAccount('renamed', '11') === 'new', 'the new login is a new profile');
ok(await getUserProfile('newbie') === null && (await getUserProfile('renamed'))?.twitchId === '11', 'the profile moved to the new login');
ok(await kv.hget('acct:ids', '11') === 'renamed', 'acct:ids follows the rename');
ok((await listAsideAccounts()).length === 0, 'a rename is not a move aside');

// a new login that already holds cards is left alone: both profiles stay, acct:ids keeps the first, /account offers the earlier one
await seedSeason1();
const cn = (await listSeasons())[0].collectionName;
await bindAccount('oldn', '61');
await saveUserProfile({ username: 'newn', displayName: 'newn', createdAt: 3 } as never);
await saveCollection(cn, { oldn: [E(1)], newn: [E(2)] });
ok(await bindAccount('newn', '61') === 'claim', 'a profile with no ID is claimed');
ok(!!(await getUserProfile('oldn')) && (await getUserProfile('newn'))?.twitchId === '61', 'nothing moved: the new login has cards');
ok(await kv.hget('acct:ids', '61') === 'oldn', 'acct:ids is write-once');
const earlier = await findEarlierAccount('newn', '61');
ok(earlier?.owner === 'oldn' && earlier.original === 'oldn' && earlier.cards === 1, 'the earlier profile is offered on /account');
ok(await findEarlierAccount('oldn', '61') === null && await findEarlierAccount('newn', '999') === null, 'nobody else is offered it');

// ── a different account on a login: the old profile moves aside, the new account starts fresh ──
await saveUserProfile({ username: 'taken', displayName: 'Taken One', twitchId: '51', createdAt: 4 } as never);
await kv.hset('acct:ids', { '51': 'taken' });
await saveCollection(cn, { ...(await getCollection(cn)), taken: [E(1), E(3)] });
const nConflicts = (await listAccountConflicts()).length;
ok(await bindAccount('taken', '52') === 'conflict', 'a different account on the same login is a conflict');
const fresh = await getUserProfile('taken');
ok(fresh?.twitchId === '52' && fresh.displayName === 'taken', 'the new account has a fresh profile under the login');
const cols = await getCollection(cn);
ok((cols.taken ?? []).length === 0 && (cols['taken~1'] ?? []).length === 2, 'the old cards moved to taken~1');
const aside1 = await getUserProfile('taken~1');
ok(aside1?.twitchId === '51' && aside1.displayName === 'Taken One (former)', 'the old profile moved to taken~1, tagged (former)');
ok(await kv.hget('acct:ids', '51') === 'taken~1' && await kv.hget('acct:ids', '52') === 'taken', 'acct:ids points each ID at its own login');
ok((await listAsideAccounts()).some(a => a.to === 'taken~1' && a.login === 'taken' && a.id === '51'), 'the aside registry records it');
ok((await listAccountConflicts()).length === nConflicts, 'a successful move aside records no conflict');
ok(await bindAccount('taken', '52') === 'same', 'signing in again is ordinary');

// the old owner comes back under another login: nothing moves by itself, /account offers it, declining stops that
ok(await bindAccount('takennew', '51') === 'new', 'the old owner gets a new profile');
ok(!!(await getUserProfile('taken~1')) && await kv.hget('acct:ids', '51') === 'taken~1', 'their moved-aside profile is not touched');
const back = await findEarlierAccount('takennew', '51');
ok(back?.owner === 'taken~1' && back.original === 'taken' && back.cards === 2, 'the earlier collection is offered, under the login they knew');
ok(await findEarlierAccount('taken', '52') === null, 'the account now holding the login is not offered it');
await declineAside('taken~1');
ok(await findEarlierAccount('takennew', '51') === null, 'a declined restore is not offered again');

// ── a conflict that cannot be moved aside is recorded and changes nothing ──
await saveUserProfile({ username: 'tilde~1', displayName: 'T', twitchId: '5', createdAt: 1 } as never);
const before = JSON.stringify(await getUserProfile('tilde~1'));
ok(await bindAccount('tilde~1', '99') === 'conflict', 'a conflict on a ~ login (which cannot be moved aside) is still a conflict');
ok(JSON.stringify(await getUserProfile('tilde~1')) === before, 'the profile is untouched');
ok(await kv.hget('acct:ids', '99') === null, 'the intruder is not indexed');
const conflicts = await listAccountConflicts();
ok(conflicts.length === nConflicts + 1 && conflicts[0].login === 'tilde~1' && conflicts[0].storedId === '5' && conflicts[0].newId === '99' && conflicts[0].count === 1 && conflicts[0].seen > 0, 'the conflict is recorded');
await bindAccount('tilde~1', '99');
ok((await listAccountConflicts())[0].count === 2, 'a repeat bumps the count');
ok((await loadDataHealth(null)).accountConflicts.length === nConflicts + 1, 'Data health lists the conflicts');

// ── a half-done move of this login is finished first ──
await saveUserProfile({ username: 'half', displayName: 'Half', twitchId: '70', createdAt: 1 } as never);
ok(!(await moveAccount('half', 'half~1', { reason: 'x', failAfter: 'snapshot' })).ok, 'a move stops after its first steps');
ok(await bindAccount('half', '71') === 'new', 'the sign-in finishes the old move, then the login starts fresh');
ok((await getUserProfile('half~1'))?.twitchId === '70' && (await getUserProfile('half'))?.twitchId === '71', 'both profiles are where they belong');
ok((await listUnfinishedMoves()).length === 0, 'no unfinished move is left');

// ── a sandbox sign-in keeps the old behaviour and records nothing ──
await runInSandbox('chk1', async () => {
  ok(await bindAccount('fakeuser', '7') === 'same', 'a sandbox sign-in reports no classification');
  ok((await getUserProfile('fakeuser'))?.twitchId === '7', 'the sandbox profile is created as before');
  await bindAccount('fakeuser', '8');
  ok((await getUserProfile('fakeuser'))?.twitchId === '7', 'and never rebound');
  ok(await kv.hget('acct:ids', '7') === null && (await listAccountConflicts()).length === 0, 'nothing is indexed or recorded in a sandbox');
});
ok(await getUserProfile('fakeuser') === null, 'the sandbox profile did not leak into production');

// ── a failing KV never throws into sign-in ──
const realError = console.error, realFetch = globalThis.fetch;
console.error = () => {};
globalThis.fetch = () => Promise.reject(new Error('kv down'));
let res: unknown = 'unset';
try { res = await bindAccount('failing', '44'); } catch { res = 'threw'; }
globalThis.fetch = realFetch;
console.error = realError;
ok(res === null, 'a KV failure does not throw, it returns null');

console.log('check-account-id: ok');
