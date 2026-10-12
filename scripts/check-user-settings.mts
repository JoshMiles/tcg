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

// ── pinned showcase copy ──
ok(c.sanitizeUserSettings({ pinned: 1000042 }).pinned === 1000042, 'a unique copy number can be pinned');
ok(c.sanitizeUserSettings({ pinned: 'x' }).pinned === null && c.sanitizeUserSettings({ pinned: 5 }).pinned === null && c.sanitizeUserSettings({ pinned: 1.5e9 }).pinned === null && c.sanitizeUserSettings({ pinned: 1000000.5 }).pinned === null, 'anything else is dropped');
ok(c.sparse(c.DEFAULT_SETTINGS).pinned === undefined, 'nothing pinned stores nothing');
const pw = await import('../lib/profile-widgets');
ok(pw.withPinnedWidget(null)[0].type === 'pinned' && pw.withPinnedWidget(null).length === pw.DEFAULT_PROFILE_LAYOUT.length + 1, 'pinning adds the widget to the default layout');
ok(pw.withPinnedWidget([{ type: 'stats', span: 4 }]).map(w => w.type).join() === 'pinned,stats', 'and to a custom one, at the top');
ok(pw.withPinnedWidget([{ type: 'pinned', span: 6 }, { type: 'stats', span: 4 }]).map(w => w.span).join() === '6,4', 'but never twice, and it keeps the owner\'s size');
const cs = await import('../lib/copy-share');
const spec = cs.copyShareSpec({ copy: { id: '1.3.2', uid: 1000042, card: 1, variant: 'shiny', n: 2, owner: 'ann', at: Date.UTC(2026, 9, 12), origin: 'pull', ev: [] }, cardName: 'Gouda', seasonId: 's1', seasonName: 'Season 1', packName: 'Starter', total: 5, mult: 2.9, art: '/a.webp', privateHolder: false, siteUrl: 'https://cheesytcg.app' });
ok(spec.plate?.number === '#1000042' && spec.plate.gold && spec.plate.edition === 'Edition #2 of 5 made' && spec.footer === 'cheesytcg.app/c/1000042', 'copy share spec: number, gold, edition, short link');
ok(spec.plate?.lines?.[0] === 'Held by @ann' && spec.plate.qrUrl === 'https://cheesytcg.app/copy/s1/1.3.2' && spec.title === 'Shiny Full Art Gouda', 'holder, QR link and title');
ok(cs.copyShareSpec({ copy: { id: '1.0.1', card: 1, variant: 'regular', n: 1, owner: 'ann', at: 0, origin: 'pull', ev: [] }, cardName: 'G', seasonId: 's', seasonName: 'S', packName: 'P', total: 1, mult: 1, art: '', privateHolder: true, siteUrl: 'https://x.y' }).plate?.lines?.[0] === 'Held by a private collector', 'private holders are not named');

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
