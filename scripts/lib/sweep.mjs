// Shared pieces of the review sweeps (sweep-public.mjs, sweep-admin.mjs, sweep-mod-access.mjs): finding Playwright, the base URL,
// logging in the way each kind of person does locally, and the per-page measurements.

import { pathToFileURL } from 'node:url';

export const BASE = process.env.SWEEP_BASE ?? 'http://localhost:3111';
export const TWITCH_MOCK = process.env.TWITCH_MOCK ?? 'http://localhost:4222';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'pw';

/** Playwright from the project, from PLAYWRIGHT_MODULE (a path to its index.mjs), or from the Claude cloud environment. */
export async function loadPlaywright() {
  const custom = process.env.PLAYWRIGHT_MODULE;
  const customUrl = custom && (custom.startsWith('file:') ? custom : pathToFileURL(custom).href);
  const tries = [() => import('playwright'), ...(customUrl ? [() => import(customUrl)] : []), () => import('/opt/node-tools/node_modules/playwright/index.mjs')];
  for (const t of tries) { try { return (await t()).chromium; } catch { /* next */ } }
  throw new Error('Playwright not found. Install it (npm i -D playwright && npx playwright install chromium) or set PLAYWRIGHT_MODULE to its index.mjs.');
}

/** Admin through the emergency password (sets the httpOnly admin cookie on this context). */
export async function loginAdminPassword(ctx) {
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: ADMIN_PASSWORD } });
  if (!res.ok()) throw new Error(`Admin password login failed (${res.status()}). Is ADMIN_PASSWORD '${ADMIN_PASSWORD}' and ADMIN_COOKIE_SECRET (16+ characters) in .env.local?`);
}

/** Signs this context in as a fake-Twitch viewer (and so as staff when that login is on the staff list). */
export async function loginTwitch(ctx, login, returnTo = '/settings') {
  await fetch(`${TWITCH_MOCK}/__as?login=${encodeURIComponent(login)}`);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth/twitch?returnTo=${encodeURIComponent(returnTo)}`, { timeout: 90000, waitUntil: 'load' });
  await p.waitForLoadState('networkidle').catch(() => {});
  const where = new URL(p.url()).pathname;
  await p.close();
  return where;
}

/** One page: navigate, settle, measure. Returns { status, url, info, errors } (info is null when the page kept navigating). */
export async function visit(p, path, errors) {
  errors.length = 0;
  const res = await p.goto(BASE + path, { timeout: 90000, waitUntil: 'load' }).catch(() => null);
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(900);
  let info = null;
  for (let t = 0; t < 4 && !info; t++) {
    try {
      info = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // Content pushed past the right edge while the page itself does not scroll (a grid column stretched by a wide child, with an
        // ancestor hiding the overflow): elements wider than the viewport that no scrolling ancestor contains.
        clipped: [...document.querySelectorAll('main *, [role="main"] *')].filter(e => {
          if (e.closest('svg')) return false;
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.right <= innerWidth + 1) return false;
          for (let a = e.parentElement; a && a !== document.body && !a.matches('main, [role="main"]'); a = a.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) return false; }
          return true;
        }).length,
        h1: document.querySelectorAll('h1').length,
        title: document.title,
        noAlt: [...document.querySelectorAll('img:not([alt])')].length,
        unnamed: [...document.querySelectorAll('button, a')].filter(e => !(e.textContent || '').trim() && !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('title') && !e.querySelector('img[alt]:not([alt=""])')).length,
      }));
    } catch { await p.waitForTimeout(1500); }
  }
  return { status: res?.status() ?? null, url: new URL(p.url()).pathname + new URL(p.url()).search, info, errors: [...errors] };
}

export function flagsFor(r, { expectH1 = true } = {}) {
  const flags = [];
  const i = r.info;
  if (!i) return ['could not measure (kept navigating)'];
  if (i.overflow > 1) flags.push(`overflow ${i.overflow}px`);
  if (i.clipped) flags.push(`${i.clipped} elements pushed past the right edge`);
  if (expectH1 && i.h1 !== 1) flags.push(`h1=${i.h1}`);
  if (i.noAlt) flags.push(`${i.noAlt} img without alt`);
  if (i.unnamed) flags.push(`${i.unnamed} unnamed controls`);
  if (r.errors.length) flags.push('console: ' + r.errors.join(' | '));
  return flags;
}

export function watchConsole(p) {
  const errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message.slice(0, 160)));
  return errors;
}
