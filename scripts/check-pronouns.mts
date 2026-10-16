// Checks the pronouns: the setting's sanitizer, how pr.alejo.io's answer becomes a label, and the cached, never-throwing lookup.
// Needs the mock KV (npm run check starts one). Run: node scripts/run-checks.mjs pronouns
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

if (!process.env.KV_REST_API_URL?.includes('localhost')) throw new Error('Refusing to run against a non-local KV');
const p = await import('../lib/pronouns');
const settings = await import('../lib/user-settings');

// ── the setting ──
eq(settings.DEFAULT_SETTINGS.pronouns, { mode: 'none' }, 'nobody shows pronouns until they choose');
eq(settings.sanitizeUserSettings({}).pronouns, { mode: 'none' }, 'missing: none');
eq(p.sanitizePronouns({ mode: 'set', value: 'theythem' }), { mode: 'set', value: 'theythem' }, 'a listed pick is kept');
eq(p.sanitizePronouns({ mode: 'set', value: 'free text' }), { mode: 'none' }, 'no free text: an unlisted value drops back to none');
eq(p.sanitizePronouns({ mode: 'set' }), { mode: 'none' }, 'set with no value is none');
eq(p.sanitizePronouns({ mode: 'alejo', value: 'hehim' }), { mode: 'alejo' }, 'alejo carries no value');
eq(p.sanitizePronouns({ mode: 'everyone' }), { mode: 'none' }, 'unknown mode');
eq(p.sanitizePronouns('he/him'), { mode: 'none' }, 'not an object');
eq(settings.sparse(settings.sanitizeUserSettings({ pronouns: { mode: 'none' } })).pronouns, undefined, 'the default is not stored');
eq(settings.sparse(settings.sanitizeUserSettings({ pronouns: { mode: 'set', value: 'sheher' } })).pronouns, { mode: 'set', value: 'sheher' }, 'a choice is stored');
ok(p.PRONOUN_CHOICES.every(c => p.pronounLabel(c.id) === c.label) && p.pronounLabel('nope') === null, 'every pick has a label');

// ── pr.alejo.io's answer to a label ──
const table = {
  hehim: { name: 'hehim', subject: 'He', object: 'Him', singular: false },
  theythem: { name: 'theythem', subject: 'They', object: 'Them', singular: false },
  any: { name: 'any', subject: 'Any', object: 'Any', singular: true },
};
eq(p.alejoLabel({ pronoun_id: 'hehim', alt_pronoun_id: null }, table), 'he/him', 'a pair');
eq(p.alejoLabel({ pronoun_id: 'hehim', alt_pronoun_id: 'theythem' }, table), 'he/they', 'two pronouns');
eq(p.alejoLabel({ pronoun_id: 'any' }, table), 'any', 'a single-word pronoun');
eq(p.alejoLabel({ pronoun_id: 'unknown' }, table), null, 'an id the table does not know');
eq([p.alejoLabel(null, table), p.alejoLabel({ pronoun_id: 'hehim' }, null)], [null, null], 'nothing known');

// ── the lookup: cached, never on the critical path, only for people who chose it ──
const store = await import('../lib/pronouns-store');
const real = globalThis.fetch;
const calls: string[] = [];
let mode: 'ok' | 'fail' | 'slow' = 'ok';
const users: Record<string, unknown> = { amy: { channel_login: 'amy', pronoun_id: 'sheher', alt_pronoun_id: 'theythem' } };
const tbl = { sheher: { name: 'sheher', subject: 'She', object: 'Her', singular: false }, theythem: table.theythem };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes('pronouns.alejo.io')) return real(input, init);
  calls.push(url.replace(/^.*\/v1/, ''));
  if (mode === 'fail') return new Response('nope', { status: 500 });
  if (mode === 'slow') await new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
  if (url.endsWith('/pronouns')) return Response.json(tbl);
  const login = decodeURIComponent(url.split('/users/')[1] ?? '');
  return login in users ? Response.json(users[login]) : new Response('{}', { status: 404 });
}) as typeof fetch;

eq(await store.pronounsFor('amy', { mode: 'none' }), null, 'none shows nothing');
eq(await store.pronounsFor('amy', { mode: 'set', value: 'itits' }), 'it/its', 'a pick is shown as is');
eq(calls.length, 0, 'neither none nor a pick contacts pr.alejo.io');

eq(await store.pronounsFor('Amy', { mode: 'alejo' }), 'she/they', 'from pr.alejo.io (login lower-cased)');
eq(calls.sort(), ['/pronouns', '/users/amy'], 'one lookup, plus the table');
await store.pronounsFor('amy', { mode: 'alejo' });
eq(calls.length, 2, 'the answer is cached: no second call');

eq(await store.pronounsFor('bob', { mode: 'alejo' }), null, 'nothing set (404): nothing shown');
const afterBob = calls.length;
await store.pronounsFor('bob', { mode: 'alejo' });
eq(calls.length, afterBob, 'a miss is cached too');
eq(afterBob, 3, 'and the table was cached, so bob cost one call');

mode = 'fail';
eq(await store.pronounsFor('cat', { mode: 'alejo' }), null, 'a failing service shows nothing and does not throw');
const afterCat = calls.length;
await store.pronounsFor('cat', { mode: 'alejo' });
eq(calls.length, afterCat, 'a failure is remembered for a short while, so a page is not slowed on every view');

mode = 'slow';
const t0 = Date.now();
eq(await store.pronounsFor('dan', { mode: 'alejo' }), null, 'a slow service shows nothing');
ok(Date.now() - t0 < 4000, `it gives up after about two seconds (${Date.now() - t0}ms)`);

eq(await store.pronounsFor('x'.repeat(40), { mode: 'alejo' }), null, 'an impossible login is not sent anywhere');
eq(await store.pronounsFor('bad/login', { mode: 'alejo' }), null, 'and neither is one with odd characters');
globalThis.fetch = real;
console.log('pronouns ok');
