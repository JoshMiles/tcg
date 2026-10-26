// Checks the nightly Twitch check (ROADMAP 47.8 PR 4): a rename into a blank login is followed, anything else is left for staff, and it never
// runs outside production or inside a sandbox. The Helix lookup is injected, so no network is used.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-account-helix.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

const { kv, runInSandbox } = await import('../lib/db');
const kvLib = await import('../lib/kv');
const { encodeEntry } = await import('../lib/variants');
const { runAccountCheck, getAccountCheck } = await import('../lib/account-helix-check');
const E = (n: number) => encodeEntry(n, 'regular');

await kvLib.seedSeason1();
const C = (await kvLib.listSeasons())[0].collectionName;

// A player with cards and a profile holding a Twitch ID; `registry: false` leaves out the acct:ids entry (a profile from before PR 1).
async function player(login: string, id: string, registry = true) {
  const data = await kvLib.getCollection(C);
  data[login] = [E(1), E(2)];
  await kvLib.saveCollection(C, data);
  await kvLib.saveUserProfile({ username: login, displayName: login, twitchId: id, createdAt: 1 });
  if (registry) await kv.hset('acct:ids', { [id]: login });
}
const cards = async (login: string) => (await kvLib.getCollection(C))[login]?.length ?? 0;

await player('ren1', '1001');          // renamed on Twitch to a blank login: followed
await player('ren2', '1002');          // renamed to a login that has cards: staff
await player('ren3', '1003');          // renamed to a login holding another account's profile: staff
await player('gone', '1004');          // not returned by Twitch: left alone
await player('same', '1005');          // unchanged
await player('legacy', '1007', false); // no acct:ids entry yet: backfilled
await kvLib.saveUserProfile({ username: 'tilde~1', displayName: 'tilde (former)', twitchId: '1006', createdAt: 1 });
await kv.hset('acct:ids', { '1006': 'tilde~1' });
await kvLib.saveCollection(C, { ...(await kvLib.getCollection(C)), hascards: [E(3)], otherprof: [] });
await kvLib.saveUserProfile({ username: 'otherprof', displayName: 'other', twitchId: '9999', createdAt: 1 });
await kv.hset('acct:ids', { '9999': 'otherprof' }); // a viewer with no cards has no collection entry any more, so the registry is how the check finds them

const asked: string[] = [];
const lookup = (ids: string[]) => {
  asked.push(...ids);
  return Promise.resolve({ '1001': 'newname1', '1002': 'hascards', '1003': 'otherprof', '1005': 'same', '1007': 'legacy' } as Record<string, string>);
};

// Refused outside production and inside a sandbox.
delete process.env.VERCEL_ENV;
ok(await throws(() => runAccountCheck({ lookup })), 'no check outside production');
process.env.VERCEL_ENV = 'preview';
ok(await throws(() => runAccountCheck({ lookup })), 'no check on a preview');
process.env.VERCEL_ENV = 'production';
ok(await throws(() => runInSandbox('some-sandbox', () => runAccountCheck({ lookup }))), 'no check inside a sandbox');
eq(asked, [], 'a refused run asks Twitch nothing');
eq(await getAccountCheck(), null, 'a refused run saves nothing');

const run = await runAccountCheck({ lookup });
eq(run.error, undefined, 'the run succeeds');
eq(asked.sort(), ['1001', '1002', '1003', '1004', '1005', '1007', '9999'], 'every known ID is looked up, a ~ login is skipped');
eq([run.checked, run.missing], [7, 2], 'checked and missing counts');
eq(run.renamed, [{ from: 'ren1', to: 'newname1' }], 'one rename is followed');
ok((await cards('newname1')) === 2 && (await cards('ren1')) === 0, 'the cards moved to the new login');
ok((await kvLib.getUserProfile('newname1'))?.twitchId === '1001' && !(await kvLib.getUserProfile('ren1')), 'the profile moved');
ok(await kv.hget('acct:ids', '1001') === 'newname1', 'acct:ids points at the new login');
eq(run.needsStaff.map(s => [s.login, s.twitchLogin]).sort(), [['ren2', 'hascards'], ['ren3', 'otherprof']], 'a login with cards, and one holding another profile, need staff');
ok((await cards('ren2')) === 2 && (await cards('hascards')) === 1 && (await cards('ren3')) === 2, 'nothing moved for them');
ok((await kvLib.getUserProfile('ren2')) && (await kvLib.getUserProfile('otherprof'))?.twitchId === '9999', 'their profiles are untouched');
ok((await cards('gone')) === 2 && (await kvLib.getUserProfile('gone')), 'an ID Twitch does not return is left alone');
ok((await cards('same')) === 2 && (await kvLib.getUserProfile('same')), 'an unchanged login is a no-op');
ok(await kv.hget('acct:ids', '1007') === 'legacy', 'a missing acct:ids entry is backfilled');
ok(await kv.hget('acct:ids', '1006') === 'tilde~1', 'a ~ login is not touched');
eq(await getAccountCheck(), run, 'the summary is saved');

// Run again: the rename is done, staff cases are listed again, nothing else changes.
const again = await runAccountCheck({ lookup: ids => lookup(ids).then(m => ({ ...m, '1001': 'newname1' })) });
eq([again.renamed.length, again.needsStaff.length, again.missing], [0, 2, 2], 'a second run follows nothing new');

// The cap stops after N moves; the rest wait for the next run.
await player('capa', '2001'); await player('capb', '2002'); await player('capc', '2003');
const capLookup = () => Promise.resolve({ '2001': 'capa2', '2002': 'capb2', '2003': 'capc2' } as Record<string, string>);
const capped = await runAccountCheck({ lookup: capLookup, maxMoves: 2 });
eq(capped.renamed.length, 2, 'the cap stops after two moves');
const rest = await runAccountCheck({ lookup: capLookup, maxMoves: 2 });
eq(rest.renamed.length, 1, 'the next run picks up the rest');

// A Helix failure is recorded, not thrown.
const failed = await runAccountCheck({ lookup: () => Promise.reject(new Error('Helix error: 500')) });
ok(failed.error === 'Helix error: 500' && (await getAccountCheck())?.error === 'Helix error: 500', 'a Helix failure is saved as an error');
delete process.env.VERCEL_ENV;

console.log(`check-account-helix: ${checks} checks passed`);
