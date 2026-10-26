// Checks the Twitch account ID bookkeeping at sign-in: the classification, the `acct:ids` index, the recorded conflicts.
// Needs the mock KV (node scripts/mock-kv.cjs) with KV_REST_API_URL / KV_REST_API_TOKEN pointing at it.
// Run: npx tsx scripts/check-account-id.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { classifySignIn } = await import('../lib/account-id');
const { bindAccount, listAccountConflicts } = await import('../lib/account-bind');
const { kv, runInSandbox } = await import('../lib/db');
const { getUserProfile, saveUserProfile } = await import('../lib/kv');
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

// the index is written once: an ID already mapped keeps its first login
await bindAccount('renamed', '11');
ok(await kv.hget('acct:ids', '11') === 'newbie', 'acct:ids is write-once');

// ── a conflict changes nothing but the record ──
const before = JSON.stringify(await getUserProfile('newbie'));
ok(await bindAccount('newbie', '99') === 'conflict', 'a different account on the same login is a conflict');
ok(JSON.stringify(await getUserProfile('newbie')) === before, 'the profile is untouched');
ok(await kv.hget('acct:ids', '99') === null, 'the intruder is not indexed');
let conflicts = await listAccountConflicts();
ok(conflicts.length === 1 && conflicts[0].login === 'newbie' && conflicts[0].storedId === '11' && conflicts[0].newId === '99' && conflicts[0].count === 1 && conflicts[0].seen > 0, 'the conflict is recorded');
await bindAccount('newbie', '99');
ok((await listAccountConflicts())[0].count === 2, 'a repeat bumps the count');
ok((await loadDataHealth(null)).accountConflicts.length === 1, 'Data health lists the conflicts');

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
