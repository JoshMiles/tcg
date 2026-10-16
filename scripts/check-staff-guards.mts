// Static audit of the access rules: every server action and admin API route must check who is calling, and only the documented
// actions may let a mod in. Server actions are public POST endpoints (Next.js lets one be invoked by id from outside its page), so
// a missing check is a real hole. This reads the source, so it needs no server and runs with `npm run check`.
// A runtime counterpart that signs in as a mod and calls every /api/admin route and admin page: scripts/sweep-mod-access.mjs.
// Run: npx tsx scripts/check-staff-guards.mts
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
const files = [...walk(join(root, 'app')), ...walk(join(root, 'lib'))].filter(f => /\.(ts|tsx)$/.test(f));

// ---- helpers: cut a source file into function segments ----
interface Seg { name: string; exported: boolean; body: string }
function segments(src: string): Seg[] {
  const re = /^(export\s+)?(?:async\s+)?function\s+(\w+)/gm;
  const marks = [...src.matchAll(re)].map(m => ({ name: m[2], exported: !!m[1], at: m.index! }));
  return marks.map((m, i) => ({ name: m.name, exported: m.exported, body: src.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : src.length) }));
}

/** Functions in the file that check directly or through another helper (so guarded() calling admin() calling requireAdmin() counts). */
function guardHelpers(segs: Seg[], guard: RegExp): string[] {
  const names = new Set(segs.filter(s => guard.test(s.body)).map(s => s.name));
  for (let changed = true; changed;) {
    changed = false;
    for (const s of segs) {
      if (names.has(s.name)) continue;
      if ([...names].some(h => new RegExp(`\\b${h}\\(`).test(s.body))) { names.add(s.name); changed = true; }
    }
  }
  return [...names];
}

const ADMIN_GUARD =/\b(requireAdmin|requireStaff)\(|\bisAuthenticated\(|\bhasStaffCapability\(/;
const VIEWER_GUARD = /\b(getSession|requireViewer|requireSession)\(/;

// ---- 1. server actions in the admin area ----
const actionFiles = files.filter(f => /^app\/admin\/.*actions\.ts$/.test(rel(f)) && /^['"]use server['"]/.test(readFileSync(f, 'utf8')));
ok(actionFiles.length >= 10, `found the admin action files (${actionFiles.length})`);

const modActions: string[] = [];
let checked = 0;
for (const f of actionFiles) {
  const segs = segments(readFileSync(f, 'utf8'));
  const helpers = guardHelpers(segs, ADMIN_GUARD);
  for (const s of segs.filter(s => s.exported)) {
    checked++;
    const guarded = ADMIN_GUARD.test(s.body) || helpers.filter(h => h !== s.name).some(h => new RegExp(`\\b${h}\\(`).test(s.body));
    ok(guarded, `${rel(f)}: exported action ${s.name}() never checks who is calling (call requireAdmin(), or requireStaff('mod') if mods may use it)`);
    if (/requireStaff\(\s*['"]mod['"]\s*\)/.test(s.body)) modActions.push(s.name);
  }
}
ok(checked >= 60, `audited a realistic number of actions (${checked})`);

// Only these may let a mod in (CLAUDE.md > Staff). Adding one is a decision, so it must be added here too.
const DOCUMENTED_MOD_ACTIONS = ['saveTagsAction', 'saveFlagsAction', 'cancelUserTradeAction', 'cancelOneTradeAction', 'blockViewerTradingAction', 'reverseTradeAction', 'updateFeedbackAction'].sort();
ok(JSON.stringify([...modActions].sort()) === JSON.stringify(DOCUMENTED_MOD_ACTIONS), `the actions a mod may use are exactly the documented ones (found: ${[...modActions].sort().join(', ')})`);

// ---- 2. viewer actions (public site) must read the session, never trust the body ----
const viewerFiles = files.filter(f => /^app\/(\(site\)|\(entity\)|u)\/.*actions\.ts$/.test(rel(f)) && /^['"]use server['"]/.test(readFileSync(f, 'utf8')));
ok(viewerFiles.length >= 3, 'found the viewer action files (profile, cards, copy)');
for (const f of viewerFiles) {
  const segs = segments(readFileSync(f, 'utf8'));
  const helpers = guardHelpers(segs, VIEWER_GUARD);
  for (const s of segs.filter(s => s.exported)) {
    const guarded = VIEWER_GUARD.test(s.body) || helpers.filter(h => h !== s.name).some(h => new RegExp(`\\b${h}\\(`).test(s.body));
    ok(guarded, `${rel(f)}: viewer action ${s.name}() never reads the signed-in session`);
  }
}

// ---- 3. admin API routes ----
const routes = files.filter(f => /^app\/api\/admin\/.*route\.ts$/.test(rel(f)));
ok(routes.length >= 4, `found the admin API routes (${routes.length})`);
const modRoutes: string[] = [];
for (const f of routes) {
  const src = readFileSync(f, 'utf8');
  // import-legacy checks its own secret (one-time utility); everything else uses the staff guards.
  const own = /import-legacy/.test(rel(f)) ? /ADMIN_SECRET|secret/.test(src) : ADMIN_GUARD.test(src);
  ok(own, `${rel(f)}: admin route never checks who is calling`);
  if (/hasStaffCapability\(\s*['"]mod['"]\s*\)/.test(src)) modRoutes.push(rel(f));
}
ok(JSON.stringify(modRoutes) === JSON.stringify(['app/api/admin/activity/route.ts']), `only the activity feed lets a mod read an admin route (found: ${modRoutes.join(', ') || 'none'})`);

// ---- 4. the guards fail closed ----
const guard = readFileSync(join(root, 'lib/staff-guard.ts'), 'utf8');
ok(/export async function requireStaff/.test(guard) && /export async function hasStaffCapability/.test(guard), 'staff guards exist');
const auth = readFileSync(join(root, 'lib/auth.ts'), 'utf8');
ok(/hasStaffCapability\(\s*['"]admin['"]\s*\)/.test(auth), "isAuthenticated() requires the 'admin' capability, not 'mod'");

if (problems.length) throw new Error(`FAILED: ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
console.log(`staff guard audit passed (${checked} admin actions, ${viewerFiles.length} viewer action files, ${routes.length} admin routes)`);
