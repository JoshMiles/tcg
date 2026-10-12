// Checks viewer settings: validation, notice gating, private profiles, direct-offer opt-out, export. Needs the mock KV on :4111.
// Run: node scripts/mock-kv.cjs & KV_REST_API_URL=http://localhost:4111 KV_REST_API_TOKEN=dev KV_URL=redis://dev npx tsx scripts/check-user-settings.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const c = await import('../lib/user-settings');
// ── validation ──
const d = c.sanitizeUserSettings(undefined);
eq(d, c.DEFAULT_SETTINGS, 'nothing in, defaults out');
const s = c.sanitizeUserSettings({ bio: '  hi\n\tthere  ' + 'x'.repeat(300), privateProfile: 'yes', notifyOffers: false, motion: 'sideways', experiments: ['shortcuts', 'bogus', 'shortcuts', 7], evil: 1 });
ok(s.bio.startsWith('hi there x') && s.bio.length === c.BIO_MAX, 'bio is cleaned and capped');
eq(s.privateProfile, false, 'a non-boolean is ignored');
eq(s.notifyOffers, false, 'a boolean is kept');
eq(s.motion, 'system', 'an unknown motion falls back');
eq(s.experiments, ['shortcuts'], 'experiments are known, unique strings');
ok(!('evil' in s), 'unknown keys are dropped');
eq(c.sparse(c.DEFAULT_SETTINGS), {}, 'defaults store nothing');
eq(c.sparse(s).notifyOffers, false, 'only changes are stored');
ok(c.wantsNotice({ ...d, notifyOffers: false }, 'offer') === false && c.wantsNotice({ ...d, notifyOffers: false }, 'accepted') === true, 'offers switch only governs offers');
ok(c.wantsNotice({ ...d, notifyOffers: false, notifyResults: false }, 'admin') === true, 'admin notices always arrive');

const sc = await import('../lib/public-shortcuts');
eq(sc.nextPublicKey(sc.PUBLIC_IDLE, 'g', 0).state.pending, true, 'g starts a sequence');
eq(sc.nextPublicKey({ pending: true, at: 0 }, 'l', 100).go, '/leaderboard', 'g l goes to the leaderboard');
eq(sc.nextPublicKey({ pending: true, at: 0 }, 'c', 100, 'Bob').go, '/u/bob', 'g c needs a login and goes to the profile');
eq(sc.nextPublicKey({ pending: true, at: 0 }, 'c', 100).go, undefined, 'g c does nothing when logged out');
eq(sc.nextPublicKey({ pending: true, at: 0 }, 'l', 5000).go, undefined, 'a stale g is ignored');

// ── stored behaviour ──
if (!process.env.KV_REST_API_URL?.includes('localhost')) throw new Error('Refusing to run against a non-local KV');
const store = await import('../lib/user-settings-store');
const { kv } = await import('../lib/db');
await store.saveUserSettings('Ann', { privateProfile: true, bio: 'hello' });
eq((await store.getUserSettings('ann')).bio, 'hello', 'settings round-trip, lower-cased');
ok((await store.getSelfHidden()).has('ann'), 'private profile joins the self-hidden set');
const admin = await import('../lib/user-admin');
ok((await admin.getHiddenUsers()).has('ann'), 'the public hidden list includes private profiles');
await admin.saveFlags('zed', { hideFromBoard: true });
await admin.saveFlags('zed', { hideFromBoard: false });
eq(await kv.get('users:hidden'), [], 'the admin list never absorbs self-hidden viewers');
await store.saveUserSettings('ann', { privateProfile: false });
ok(!(await admin.getHiddenUsers()).has('ann'), 'turning it off brings them back');
eq(await kv.get('user:ann:settings'), null, 'all-default settings are removed, not stored');

const tn = await import('../lib/trade-notify');
await store.saveUserSettings('ann', { notifyOffers: false });
await tn.notify('ann', { kind: 'offer', text: 'x' });
await tn.notify('ann', { kind: 'accepted', text: 'y' });
await tn.notify('ann', { kind: 'admin', text: 'z' });
eq((await tn.listNotices('ann')).notices.map(n => n.kind).sort(), ['accepted', 'admin'], 'a switched-off kind is not queued');

const ex = await (await import('../lib/user-export')).buildExport('ann');
eq(ex.username, 'ann', 'export is for the viewer');
ok(ex.notices.length === 2 && 'settings' in ex, 'export carries notices and settings');

// ── the pages ──
import { readFileSync } from 'node:fs';
ok(readFileSync('lib/seo.ts', 'utf8').includes("'/settings'"), '/settings is listed as noindex');
ok(readFileSync('app/api/account/settings/route.ts', 'utf8').includes('isSameOrigin'), 'saving checks the origin');
ok(!/body\.(username|user)/.test(readFileSync('app/api/account/settings/route.ts', 'utf8')), 'the viewer comes from the session, never the body');
console.log('user settings checks passed');
process.exit(0);
