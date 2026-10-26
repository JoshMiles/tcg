// Runtime half of the mod access test (the static half is scripts/check-staff-guards.mts, part of `npm run check`): signs in as a
// mod and as a stranger, then checks every /admin page and every /api/admin route refuses them, apart from what a mod may use
// (the /mod pages and GET /api/admin/activity). Exits non-zero if anything gets through.
//
// Needs the same setup as sweep-admin.mjs (seed-review, dev server, fake Twitch). Run: node scripts/sweep-mod-access.mjs
import { BASE, loadPlaywright, loginAdminPassword, loginTwitch } from './lib/sweep.mjs';

const PACK = 'pack-wheel', SEASON = 'season2';
const ADMIN_PAGES = ['/admin', '/admin/activity', '/admin/seasons', '/admin/seasons/new', `/admin/seasons/${SEASON}`, '/admin/packs', '/admin/packs/new', `/admin/packs/${PACK}`,
  `/admin/packs/${PACK}/cards`, `/admin/packs/${PACK}/cards/w1`, '/admin/users', '/admin/users/alice', '/admin/staff', '/admin/trades', '/admin/serials', '/admin/overlay',
  '/admin/assets', '/admin/settings', '/admin/settings?tab=environment', '/admin/sandbox',
  '/admin/achievements', '/admin/buffs', '/admin/changelog', '/admin/faq', '/admin/feedback', '/admin/mixitup', '/admin/wiki', '/admin/webhooks'];
// GET API routes and what they should answer a mod / a stranger.
const ADMIN_API = [
  { path: '/api/admin/overlay-status', mod: [401, 403] },
  { path: '/api/admin/palette', mod: [401, 403] },
  { path: '/api/admin/activity?after=0', mod: [200] }, // the one admin route mods may read
];
const POST_API = ['/api/admin/sandbox/ext-token'];

const browser = await (await loadPlaywright()).launch();
let failures = 0;
const report = (ok, line) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

async function probe(label, ctx, { expectPages }) {
  const p = await ctx.newPage();
  for (const path of ADMIN_PAGES) {
    await p.goto(BASE + path, { waitUntil: 'load', timeout: 90000 }).catch(() => null);
    const end = new URL(p.url()).pathname;
    const sent = end.startsWith('/admin') ? false : true; // sent away (to /mod, /login, ...)
    report(expectPages ? !sent : sent, `${label} page ${path} -> ${end}`);
  }
  await p.close();
  for (const r of ADMIN_API) {
    const res = await ctx.request.get(BASE + r.path, { maxRedirects: 0 });
    const allowed = label === 'stranger' ? (r.stranger ?? [401, 403, 307, 308]) : label === 'admin' ? (r.admin ?? [200]) : r.mod;
    report(allowed.includes(res.status()), `${label} GET ${r.path} -> ${res.status()}`);
  }
  for (const path of POST_API) {
    const res = await ctx.request.post(BASE + path, { data: {}, maxRedirects: 0 });
    report(label === 'admin' ? res.status() !== 401 && res.status() !== 403 : [401, 403, 307, 308].includes(res.status()), `${label} POST ${path} -> ${res.status()}`);
  }
}

const stranger = await browser.newContext();
await probe('stranger', stranger, { expectPages: false });
await stranger.close();

const mod = await browser.newContext();
const where = await loginTwitch(mod, 'review_mod', '/mod');
if (!where.startsWith('/mod')) console.log(`warning: the mod login ended on ${where}; check the seed and the dev server env`);
await probe('mod', mod, { expectPages: false });
// The /mod pages must work for the mod.
const mp = await mod.newPage();
for (const path of ['/mod', '/mod/activity', '/mod/users', '/mod/users/alice', '/mod/trades', '/mod/feedback', '/mod/testers', '/mod/changelog']) {
  const res = await mp.goto(BASE + path, { waitUntil: 'load', timeout: 90000 }).catch(() => null);
  report(res?.status() === 200 && new URL(mp.url()).pathname === path, `mod page ${path} -> ${res?.status()}`);
}
await mod.close();

const admin = await browser.newContext();
await loginAdminPassword(admin);
await probe('admin', admin, { expectPages: true });
await admin.close();

await browser.close();
console.log(failures ? `\n${failures} access problem(s)` : '\nnobody got anywhere they should not');
process.exit(failures ? 1 : 0);
