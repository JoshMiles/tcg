// Asserts the security header config (ROADMAP 47.5): which headers go on which paths, that the embedded paths (OBS overlay, Twitch
// panel) stay frameable, that the CSP trial is report-only, and that next.config.ts still uses the rules. Source only, no server.
// Run: npx tsx scripts/check-security-headers.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { CSP_REPORT_PATH, cspPolicy, securityHeaderRules } from '../lib/security-headers';

// Next builds a rule's matcher with its bundled path-to-regexp; use the same one so the tests below match what Vercel serves.
const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp') as { pathToRegexp: (s: string) => RegExp };
const problems: string[] = [];
const ok = (cond: unknown, msg: string) => { if (!cond) problems.push(msg); };

/** The headers a request path would receive, as Next merges the matching rules. */
function headersFor(path: string, dev = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of securityHeaderRules(dev)) {
    if (pathToRegexp(rule.source).test(path)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

const SITE = ['/', '/u/someone', '/leaderboard', '/login', '/admin', '/admin/overlay', '/mod', '/account', '/collection', '/closed'];
const EMBEDDED = ['/overlay.html', '/widget.js', '/widget.css', '/widget-dev.js', '/twitch-panel/panel.html', '/twitch-panel/mobile.html', '/twitch-panel/video_component.html', '/twitch-panel/panel.js'];
const ALL = [...SITE, ...EMBEDDED, '/api/version', '/api/twitch/state', '/api/csp-report', '/assets/cards/a.png', '/sw.js'];

for (const p of ALL) {
  const h = headersFor(p);
  ok(h['X-Content-Type-Options'] === 'nosniff', `${p}: X-Content-Type-Options nosniff`);
  ok(h['Referrer-Policy'] === 'strict-origin-when-cross-origin', `${p}: Referrer-Policy`);
  ok(/camera=\(\)/.test(h['Permissions-Policy'] ?? '') && /microphone=\(\)/.test(h['Permissions-Policy'] ?? ''), `${p}: Permissions-Policy`);
  ok(/^max-age=\d{8,}$/.test(h['Strict-Transport-Security'] ?? ''), `${p}: Strict-Transport-Security, no includeSubDomains or preload`);
}

for (const p of [...SITE, '/api/version', '/api/csp-report']) {
  ok(headersFor(p)['X-Frame-Options'] === 'SAMEORIGIN', `${p}: framing is limited to our own origin`);
}
for (const p of EMBEDDED) {
  const h = headersFor(p);
  ok(!('X-Frame-Options' in h), `${p}: stays frameable (OBS / Twitch), so no X-Frame-Options`);
  ok(!('Content-Security-Policy-Report-Only' in h) && !('Content-Security-Policy' in h), `${p}: outside the CSP`);
}

for (const p of SITE) {
  const h = headersFor(p);
  ok(!('Content-Security-Policy' in h), `${p}: the CSP trial must stay report-only until it is switched on on purpose`);
  ok(h['Content-Security-Policy-Report-Only'] === cspPolicy(), `${p}: report-only CSP`);
}
for (const p of ['/api/version', '/api/twitch/state', '/api/csp-report']) {
  ok(!('Content-Security-Policy-Report-Only' in headersFor(p)), `${p}: JSON endpoints are outside the CSP`);
}

const policy = cspPolicy();
for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", `report-uri ${CSP_REPORT_PATH}`]) {
  ok(policy.includes(d), `CSP has ${d}`);
}
for (const host of ['https://challenges.cloudflare.com', 'https://*.public.blob.vercel-storage.com', 'https://static-cdn.jtvnw.net']) {
  ok(policy.includes(host), `CSP allows ${host}`);
}
ok(!policy.includes("'unsafe-eval'"), 'production CSP has no unsafe-eval');
ok(cspPolicy(true).includes("'unsafe-eval'"), 'development CSP allows unsafe-eval (Turbopack)');

// The wiring: the config must actually use the rules, the report route must exist and the middleware must leave CORS alone.
ok(/securityHeaderRules\(/.test(readFileSync(join(import.meta.dirname, '..', 'next.config.ts'), 'utf8')), 'next.config.ts spreads securityHeaderRules()');
ok(readFileSync(join(import.meta.dirname, '..', 'app/api/csp-report/route.ts'), 'utf8').includes('export async function POST'), 'the CSP report route exists');

if (problems.length) {
  console.error(`check-security-headers: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-security-headers: ok');
