// Static audit of who may reach what, beyond the server actions (check-staff-guards.mts covers those):
//  1. every /admin and /mod page checks the live staff list itself (the layouts do not render again on in-panel navigation);
//  2. every app/**/route.ts is listed below with the way it is guarded, and its source really has that guard. A route that is not
//     listed fails, so a new route has to be classified on purpose. `public` is for routes that are open by design, with the reason.
// Reads the source only, so it needs no server. Run: npx tsx scripts/check-route-guards.mts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const problems: string[] = [];
const ok = (cond: unknown, msg: string) => { if (!cond) problems.push(msg); };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(root, p).split('\\').join('/');
const appFiles = walk(join(root, 'app')).map(rel);

// ---- 1. panel pages ----
const ADMIN_PAGE_GUARD = /\b(staffPage|requireStaff)\(\s*['"]admin['"]\s*\)|\brequireAdmin\(/;
const MOD_PAGE_GUARD = /\bstaffPage\(\s*['"](mod|admin)['"]\s*\)|\brequireStaff\(|\brequireAdmin\(/;
const pages = appFiles.filter(f => /^app\/(admin|mod)\/(.*\/)?page\.(tsx?|jsx?|mdx)$/.test(f));
ok(pages.length >= 35, `found the panel pages (${pages.length})`);
for (const f of pages) {
  const guard = f.startsWith('app/mod/') ? MOD_PAGE_GUARD : ADMIN_PAGE_GUARD;
  ok(guard.test(readFileSync(join(root, f), 'utf8')), `${f}: the page never checks who is calling (start it with await staffPage('${f.startsWith('app/mod/') ? 'mod' : 'admin'}'))`);
}

// ---- 2. every route ----
const GUARDS = {
  staff: /\b(requireAdmin|requireStaff)\(|\bisAuthenticated\(|\bhasStaffCapability\(/,
  viewer: /\b(getSession|requireViewer|requireSession|extensionViewer|verifyExtensionAuth)\(/,
  cron: /\bCRON_SECRET\b/,
  webhook: /\b(parseIncomingWebhook|incomingSecretValid)\(/,
  overlay: /\bisOverlayRequest\(/,
  bridge: /\b(bridgeGuard|bridgeStaffGuard|pairGuard)\(/, // TCG Bridge: a Bearer token (pair: a one-time code, rate limited)
};
type Kind = keyof typeof GUARDS | 'public';
// A route may carry several kinds when its methods differ (all of them must show up in the source).
const R: Record<string, Kind[] | { public: string }> = {
  // the viewer's own account, trades and feedback: the signed-in session decides who they are
  'app/api/account/deletion/route.ts': ['viewer'],
  'app/api/account/sign-out-everywhere/route.ts': ['viewer'],
  'app/api/account/discord/route.ts': ['viewer'],
  'app/api/account/export/route.ts': ['viewer'],
  'app/api/account/push/route.ts': ['viewer'],
  'app/api/account/settings/route.ts': ['viewer'],
  'app/api/account/share/route.ts': ['viewer'],
  'app/api/account/upgrade/route.ts': ['viewer'],
  'app/api/feedback/report/route.ts': ['viewer'],
  'app/api/feedback/route.ts': ['viewer'],
  'app/api/notifications/route.ts': ['viewer'],
  'app/api/trades/[id]/route.ts': ['viewer'],
  'app/api/trades/holdings/route.ts': ['viewer'],
  'app/api/trades/route.ts': ['viewer'],
  'app/auth/access/route.ts': ['viewer'],
  'app/auth/discord/route.ts': ['viewer'],
  'app/auth/staff/route.ts': ['viewer'], // turns a signed-in viewer into staff only after the live staff-list lookup
  // the Twitch panel: the signed Extension token decides who they are (panel freeze, never change the shapes)
  'app/api/twitch/favourite/route.ts': ['viewer'],
  'app/api/twitch/login/route.ts': ['viewer'],
  'app/api/twitch/me/route.ts': ['viewer'],
  'app/api/twitch/trades/route.ts': ['viewer'],
  'app/api/twitch/trainer/route.ts': ['viewer'],
  'app/api/twitch/unlink/route.ts': ['viewer'],
  'app/api/twitch/upgrade/route.ts': ['viewer'],
  'app/api/twitch/want/route.ts': ['viewer'],
  // staff outside /api/admin (the ones under /api/admin are checked below without being listed)
  'app/api/upload/optimize/route.ts': ['staff'],
  'app/api/upload/route.ts': ['staff'],
  'app/api/upload/token/route.ts': ['staff'],
  // machines: Vercel Cron, Mix It Up with the incoming secret, the OBS overlay with the overlay key
  'app/api/cron/accounts/route.ts': ['cron'],
  'app/api/cron/backup/route.ts': ['cron'],
  'app/api/cron/minute/route.ts': ['cron'],
  'app/api/cron/weekly/route.ts': ['cron'],
  'app/api/webhooks/collection/route.ts': ['webhook'],
  'app/api/webhooks/command/route.ts': ['webhook'],
  'app/api/webhooks/grant-card/route.ts': ['webhook'],
  'app/api/webhooks/pull/route.ts': ['webhook'],
  'app/api/webhooks/show-card/route.ts': ['webhook'],
  'app/api/webhooks/stream/route.ts': ['webhook'],
  'app/api/webhooks/buff/route.ts': ['webhook'],
  'app/api/webhooks/notify/route.ts': ['overlay'],
  'app/api/webhooks/queue/route.ts': ['overlay'],
  'app/api/overlay/heartbeat/route.ts': ['overlay'],
  'app/api/bridge/action/route.ts': ['bridge'],
  'app/api/bridge/queue/route.ts': ['bridge'],
  'app/api/bridge/hello/route.ts': ['bridge'],
  'app/api/bridge/pair/route.ts': ['bridge'],
  'app/api/bridge/ledger/route.ts': ['bridge'],
  'app/api/bridge/poll/route.ts': ['bridge'],
  'app/api/bridge/report/route.ts': ['bridge'],
  'app/api/bridge/result/route.ts': ['bridge'],
  'app/api/bridge/staff/route.ts': ['bridge'],
  'app/api/collection/route.ts': ['overlay', 'staff'], // GET: the overlay key; POST: a ticket, or staff for a whole-collection replace
  // open by design
  'app/api/auth/login/route.ts': { public: 'the emergency password login: checks the password itself and is rate limited' },
  'app/api/auth/logout/route.ts': { public: 'clears the caller\'s own cookies' },
  'app/auth/logout/route.ts': { public: 'clears the caller\'s own cookies' },
  'app/auth/twitch/route.ts': { public: 'starts the Twitch sign-in' },
  'app/auth/twitch/callback/route.ts': { public: 'finishes the Twitch sign-in; the state value is checked there' },
  'app/auth/discord/callback/route.ts': { public: 'finishes the Discord link; the session and state are checked there' },
  'app/api/sandbox/exit/route.ts': { public: 'only clears the sandbox and test-login cookies' },
  'app/api/cards/[number]/owners/route.ts': { public: 'public Card Dex data (hidden collectors left out)' },
  'app/api/live/route.ts': { public: 'is the channel live' },
  'app/api/csp-report/route.ts': { public: 'browsers post Content-Security-Policy reports with no credentials; capped and only logged' },
  'app/api/overlay/config/route.ts': { public: 'how the overlay is drawn; the OBS browser source has no sign-in' },
  'app/api/recent-pulls/route.ts': { public: 'recent public pulls' },
  'app/api/search/route.ts': { public: 'public site search' },
  'app/api/seasons/active/route.ts': { public: 'the active season, public' },
  'app/api/version/route.ts': { public: 'build stamp' },
  'app/api/twitch/collection/route.ts': { public: 'public collections; a private profile only for its owner (extension token or session)' },
  'app/api/twitch/leaderboard/route.ts': { public: 'public leaderboard for the panel' },
  'app/api/twitch/resolve-username/route.ts': { public: 'panel: Twitch user id to login (public Twitch data)' },
  'app/api/twitch/season/route.ts': { public: 'panel: the active season, public' },
  'app/api/twitch/user/route.ts': { public: 'panel: opaque id to linked username (panel freeze, shape fixed)' },
};

const routes = appFiles.filter(f => /(^|\/)route\.(ts|tsx|js)$/.test(f));
ok(routes.length >= 60, `found the routes (${routes.length})`);
for (const f of routes) {
  const src = readFileSync(join(root, f), 'utf8');
  if (f.startsWith('app/api/admin/')) {
    ok(GUARDS.staff.test(src), `${f}: admin route never checks who is calling`);
    continue;
  }
  const entry = R[f];
  if (!entry) { problems.push(`${f}: not in the route list (add it with how it is guarded, or as public with the reason)`); continue; }
  if (!Array.isArray(entry)) continue;
  for (const kind of entry) ok(GUARDS[kind as keyof typeof GUARDS].test(src), `${f}: listed as ${kind} but the source has no such check`);
}
for (const f of Object.keys(R)) ok(routes.includes(f), `${f}: in the route list but the route no longer exists`);

if (problems.length) throw new Error(`FAILED: ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
console.log(`route guard audit passed (${pages.length} panel pages, ${routes.length} routes)`);
