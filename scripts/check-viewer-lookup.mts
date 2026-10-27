// Checks the mod viewer list merge (profile-only viewers from `acct:ids`) and the per-staff 7-day action counts.
// Needs the mock KV (node scripts/mock-kv.cjs) with KV_REST_API_URL / KV_REST_API_TOKEN pointing at it.
// Run: npx tsx scripts/check-viewer-lookup.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { withProfileOnly, getSignedInLogins } = await import('../lib/viewer-list');
const { countByStaff, getStaffActionCounts } = await import('../lib/audit');
const { kv } = await import('../lib/db');

// ── profile-only viewers join the list with no pulls ──
const season = { id: 's1', name: 'S1', collectionName: 'c1', cards: [1, 2] };
const merged = withProfileOnly([{ username: 'puller', seasons: [season] }], ['Puller', 'Lurker', 'lurker', 'quiet']);
ok(merged.length === 3, 'a login already in the collections is not added twice, and case duplicates collapse');
const lurker = merged.find(u => u.username === 'lurker');
ok(lurker && lurker.seasons.length === 0, 'a profile-only viewer has no seasons (zero pulls)');
ok(merged.find(u => u.username === 'puller')?.seasons[0].cards.length === 2, 'a viewer with pulls keeps them');

await kv.hset('acct:ids', { '11': 'lurker', '12': 'puller' });
const logins = await getSignedInLogins();
ok(logins.length === 2 && logins.includes('lurker'), 'getSignedInLogins reads the acct:ids values');

// ── per-staff actions in the last 7 days ──
const now = Date.now(), DAY = 86400000;
const e = (by: string | undefined, ago: number) => ({ at: now - ago, username: 'v', action: 'x', ...(by ? { by } : {}) });
const counts = countByStaff([e('ann', DAY), e('ann', 6 * DAY), e('ann', 8 * DAY), e('bob', 0), e(undefined, DAY)], now);
ok(counts.ann === 2 && counts.bob === 1, 'counts only entries inside 7 days, per login');
ok(Object.keys(counts).length === 2, 'entries with no staff login are skipped');

await kv.lpush('audit:all', e('cat', DAY));
await kv.lpush('audit:all', e('cat', 2 * DAY));
ok((await getStaffActionCounts()).cat === 2, 'getStaffActionCounts reads audit:all');

console.log('check-viewer-lookup: ok');
