// ROADMAP 48.5: the in-memory caches that make polling cheap (overlay key 30 s, staff record 15 s), the TTL cache's clear() race, and
// the overlay's queue-poll back-off. Mock KV: node scripts/mock-kv.cjs. Run: npx tsx scripts/check-polling.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET ??= 'a-test-secret-that-is-long-enough-123';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { readFileSync } = await import('node:fs');
const { kv, prodKv } = await import('../lib/db');
const { createTtlCache } = await import('../lib/ttl-cache');
const keys = await import('../lib/overlay-key');
const staff = await import('../lib/staff');

// A clock we control for the caches (they read Date.now each time).
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
try {
  // ── the TTL cache: a clear() while a read is running must not let that (older) read be kept ──
  const c = createTtlCache<string>(1000);
  let release!: (v: string) => void;
  const slow = c.get('k', () => new Promise<string>(r => { release = r; }));
  c.clear();
  release('old');
  ok((await slow) === 'old', 'the caller that was waiting still gets its value');
  ok((await c.get('k', async () => 'new')) === 'new', 'but a clear() during the read means the old value is not kept');

  // ── the overlay key: kept 30 s, replaced at once on this instance when it is regenerated ──
  const key = await keys.getOverlayKey();
  const other = 'f'.repeat(32);
  await kv.set('overlay:key', other); // written behind the cache's back, like another instance would
  ok((await keys.getOverlayKey()) === key, 'the key comes from memory within the TTL');
  skew += keys.OVERLAY_KEY_TTL_MS + 1;
  ok((await keys.getOverlayKey()) === other, 'after the TTL it is read again');
  const fresh = await keys.regenerateOverlayKey();
  ok(fresh !== other && (await keys.getOverlayKey()) === fresh, 'regenerating shows the new key on this instance at once');

  // ── staff records: kept 15 s, cleared on this instance by every staff write ──
  const SUPER = { login: 'joshmiles', role: 'super' as const };
  const login = `poll_${realNow().toString(36)}`;
  ok((await staff.getStaffRecord(login)) === null, 'not staff yet');
  ok((await staff.addStaff(SUPER, login, 'mod')).ok, 'added as a mod');
  ok((await staff.getStaffRecord(login))?.role === 'mod', 'an add shows at once (the cached "not staff" was cleared)');
  await prodKv.hset('staff:members', { [login]: { login, role: 'admin', addedBy: 'x', addedAt: 1 } }); // behind the cache's back
  ok((await staff.getStaffRecord(login))?.role === 'mod', 'a role changed elsewhere is not seen inside the TTL');
  skew += staff.STAFF_CACHE_TTL_MS + 1;
  ok((await staff.getStaffRecord(login))?.role === 'admin', 'but is seen after it');
  ok((await staff.setStaffRole(SUPER, login, 'mod')).ok && (await staff.getStaffRecord(login))?.role === 'mod', 'a role change shows at once');
  ok((await staff.removeStaff(SUPER, login)).ok && (await staff.getStaffRecord(login)) === null, 'a removal shows at once');
  ok((await staff.addStaff(SUPER, login, 'mod')).ok, 'writers read the stored record, never the cache: re-adding after a removal works');
  await staff.removeStaff(SUPER, login);
} finally {
  Date.now = realNow;
}

// ── the overlay's queue poll: 2 s, then 5 s after a quiet minute (the widget's own copy of the function) ──
const w = readFileSync('public/widget.js', 'utf8');
const fn = w.match(/function nextPollDelay\(quietMs\) \{[\s\S]*?\r?\n\}/)![0];
const nextPollDelay = new Function(fn + '; return nextPollDelay;')() as (quietMs: number) => number;
ok(nextPollDelay(0) === 2000 && nextPollDelay(59_999) === 2000, 'polls every 2 s while anything happened in the last minute');
ok(nextPollDelay(60_000) === 5000 && nextPollDelay(3_600_000) === 5000, 'and every 5 s after a quiet minute');
ok(/lastEventAt = Date\.now\(\);\s*\n\s*if \(event\.type === 'pull'\)/.test(w), 'an event from the poll resets the quiet time before it is queued');
ok(/finally \{\s*\n\s*setTimeout\(pollWebhookQueue, nextPollDelay\(Date\.now\(\) - lastEventAt\)\);/.test(w), 'every poll, whatever its outcome, schedules the next one');

console.log('polling checks passed');
