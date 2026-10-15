// Sweeps every public page on a running dev server (localhost:3111, mock KV seeded, fake Twitch login) at phone and desktop width,
// signed in and signed out: flags horizontal overflow, a missing / duplicate h1, images without alt, unnamed buttons and console
// errors. Needs Playwright (npm i -D playwright, or the one pre-installed in the Claude cloud environment).
// Run: node scripts/sweep-public.mjs                      (every public page)
//      node scripts/sweep-public.mjs /u/alice /trade      (only these paths: a review batch sweeps just its own pages)
// Seed realistic data first with scripts/seed-review.mts (see docs/review.md).
import { loadPlaywright } from './lib/sweep.mjs';
const b = await (await loadPlaywright()).launch();
const defaultRoutes = ['/', '/faq', '/privacy', '/terms', '/collection', '/leaderboard', '/stats', '/cards', '/trade', '/trade?tab=board', '/trade?tab=history', '/trade/new', '/account', '/settings', '/u/alice', '/u/alice?tab=collection', '/u/alice?tab=stats', '/u/alice?tab=trades', '/u/alice?tab=activity', '/u/tester', '/copy/season1/1.0.1', '/auth/error?reason=denied', '/u/nobody_here', '/does-not-exist', '/u/hoarder', '/u/private_pat', '/u/hidden_hank', '/u/a_very_long_username_25c', '/leaderboard/season1'];
const asked = process.argv.slice(2).filter(a => a.startsWith('/'));
const routes = asked.length ? asked : defaultRoutes;
async function sweep(label, viewport, login) {
  const ctx = await b.newContext({ viewport });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message.slice(0, 160)));
  if (login) { await p.goto('http://localhost:3111/settings'); await p.waitForSelector('text=Settings', { timeout: 90000 }); }
  for (const r of routes) {
    errors.length = 0;
    const res = await p.goto('http://localhost:3111' + r, { timeout: 90000, waitUntil: 'load' }).catch(e => null);
    await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(400);
    await p.waitForTimeout(600);
    let info = null;
    for (let t = 0; t < 4 && !info; t++) { try { info = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1: document.querySelectorAll('h1').length,
      title: document.title,
      noAlt: [...document.querySelectorAll('img:not([alt])')].length,
      unnamed: [...document.querySelectorAll('button, a')].filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('title') && !e.querySelector('img[alt]:not([alt=""])')).length,
    })); } catch { await p.waitForTimeout(1500); } }
    if (!info) { console.log(`${label} ${r} [${res?.status()}] could not measure (kept navigating)`); continue; }
    const flags = [];
    if (info.overflow > 1) flags.push(`overflow ${info.overflow}px`);
    if (info.h1 !== 1) flags.push(`h1=${info.h1}`);
    if (info.noAlt) flags.push(`${info.noAlt} img without alt`);
    if (info.unnamed) flags.push(`${info.unnamed} unnamed controls`);
    if (errors.length) flags.push('console: ' + errors.join(' | '));
    console.log(`${label} ${r} [${res?.status()}] "${info.title}" ${flags.join('; ') || 'ok'}`);
  }
  await ctx.close();
}
await sweep('mobile', { width: 390, height: 844 }, true);
await sweep('tablet', { width: 768, height: 1024 }, true);
await sweep('desktop', { width: 1280, height: 900 }, true);
await sweep('out-mobile', { width: 390, height: 844 }, false);
await b.close();
