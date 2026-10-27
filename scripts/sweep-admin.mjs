// Sweeps the admin panel (/admin/*) and the mod panel (/mod/*) on a running dev server, the way sweep-public.mjs does the public site:
// phone, tablet and desktop width, flagging horizontal overflow, a missing or duplicate h1, images without alt, unnamed controls
// and console errors. Admin pages are visited as an admin (emergency password login), mod pages as a mod (fake Twitch login
// "review_mod"), and the admin pages are also visited as the mod to check they send the mod away.
//
// Needs: mock KV + `npx tsx scripts/seed-review.mts`, the dev server on :3111, the fake Twitch on :4222 and Playwright (see docs/review.md).
// Run: node scripts/sweep-admin.mjs                      (every page, three widths)
//      node scripts/sweep-admin.mjs /admin/packs ...     (only these paths, admin or mod)
//      node scripts/sweep-admin.mjs --width=390          (one width)
import { BASE, flagsFor, loadPlaywright, loginAdminPassword, loginTwitch, visit, watchConsole } from './lib/sweep.mjs';

// Dynamic routes are filled from the seed (scripts/seed-review.mts): a real pack, card, season, viewer and copy.
const PACK = 'pack-wheel', DRAFT = 'pack-draft', SEASON = 'season2', ENDED = 'season1', VIEWER = 'alice', COPY = '1.0.1';
const ADMIN_PAGES = [
  '/admin', '/admin?range=24h', '/admin?range=season', `/admin?season=${ENDED}`,
  '/admin/activity',
  '/admin/seasons', '/admin/seasons/new', `/admin/seasons/${SEASON}`, `/admin/seasons/${SEASON}?tab=packs`, `/admin/seasons/${SEASON}?tab=settings`, `/admin/seasons/${SEASON}?tab=wrapup`, `/admin/seasons/${ENDED}`, `/admin/seasons/${ENDED}?tab=wrapup`,
  '/admin/packs', '/admin/packs/new', `/admin/packs/new?draft=${DRAFT}`, `/admin/packs/${PACK}`, `/admin/packs/${PACK}?tab=odds`, `/admin/packs/${PACK}?tab=overview`, `/admin/packs/${PACK}?tab=settings`, `/admin/packs/${PACK}/cards`, `/admin/packs/${PACK}/cards/w1`, `/admin/packs/${DRAFT}`,
  '/admin/users', `/admin/users/${VIEWER}`, `/admin/users/${VIEWER}?tab=collection`, `/admin/users/${VIEWER}?tab=trades`, `/admin/users/${VIEWER}?tab=grant`, `/admin/users/${VIEWER}?tab=admin`, `/admin/users/${VIEWER}?compare=trader_a`, '/admin/users/hoarder', '/admin/users/blocked_bob', '/admin/users/nobody_here',
  '/admin/staff',
  '/admin/trades', '/admin/trades?tab=log', '/admin/trades?tab=settings',
  '/admin/serials', `/admin/serials/${SEASON}/${COPY}`,
  '/admin/overlay', `/admin/overlay?scope=${PACK}`,
  '/admin/assets', '/admin/assets?tab=pack-cover', '/admin/assets?tab=sound', '/admin/assets?tab=unused', '/admin/assets?tab=insights',
  '/admin/settings', '/admin/settings?tab=scoring', '/admin/settings?tab=webhooks', '/admin/settings?tab=viewers', '/admin/settings?tab=environment', '/admin/settings?tab=about',
  '/admin/webhooks', '/admin/sandbox', '/admin/sandbox/does-not-exist', '/admin/does-not-exist',
];
const MOD_PAGES = ['/mod', '/mod/activity', '/mod/users', `/mod/users/${VIEWER}`, '/mod/users/nobody_here', '/mod/trades', '/mod/guide', '/mod/guide/mod-restrict-viewer', '/mod/guide/mod-reverse-trade', '/mod/guide/mod-escalate', '/mod/guide/moderation', '/mod/does-not-exist'];
const WIDTHS = { 390: 844, 768: 1024, 1280: 900 };

const args = process.argv.slice(2);
const asked = args.filter(a => a.startsWith('/'));
const widthArg = args.find(a => a.startsWith('--width='))?.slice(8);
const widths = widthArg ? [Number(widthArg)] : Object.keys(WIDTHS).map(Number);
const adminPages = asked.length ? asked.filter(p => p.startsWith('/admin')) : ADMIN_PAGES;
const modPages = asked.length ? asked.filter(p => p.startsWith('/mod')) : MOD_PAGES;

const browser = await (await loadPlaywright()).launch();
let problems = 0;
async function sweep(label, ctxFactory, pages, width, opts = {}) {
  const ctx = await ctxFactory(width);
  const p = await ctx.newPage();
  const errors = watchConsole(p);
  for (const path of pages) {
    const r = await visit(p, path, errors);
    const flags = opts.expectRedirect ? (r.url.startsWith(opts.expectRedirect) ? [] : [`expected to be sent to ${opts.expectRedirect}, ended on ${r.url}`]) : flagsFor(r, { expectH1: !/does-not-exist|nobody_here/.test(path) });
    if (flags.length) problems++;
    console.log(`${label}@${width} ${path} [${r.status}] ${r.info ? `"${r.info.title}"` : ''} ${flags.join('; ') || 'ok'}`);
  }
  await ctx.close();
}

const viewport = w => ({ width: w, height: WIDTHS[w] ?? 900 });
const asAdmin = async w => { const c = await browser.newContext({ viewport: viewport(w) }); await loginAdminPassword(c); return c; };
const asMod = async w => {
  const c = await browser.newContext({ viewport: viewport(w) });
  const where = await loginTwitch(c, 'review_mod', '/mod');
  if (!where.startsWith('/mod')) console.log(`warning: mod login ended on ${where}; is review_mod on the staff list (seed-review) and SESSION_SECRET / TWITCH_* set?`);
  return c;
};

for (const w of widths) {
  if (adminPages.length) await sweep('admin', asAdmin, adminPages, w);
  if (modPages.length) await sweep('mod', asMod, modPages, w);
}
// What a mod sees on an admin URL: the middleware sends them to /mod (the access test, sweep-mod-access.mjs, goes deeper).
if (!asked.length) await sweep('mod->admin', asMod, ['/admin', '/admin/users', '/admin/settings'], widths[widths.length - 1], { expectRedirect: '/mod' });
await browser.close();
console.log(problems ? `\n${problems} page(s) flagged` : '\nall pages clean');
process.exit(problems ? 1 : 0);
