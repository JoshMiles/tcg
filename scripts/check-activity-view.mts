// The Live Activity numbers (pulls per minute, last hour, viewers, rare, new cards, the sparkline) count webhook grants as pulls.
// Pure (no database). Run: npx tsx scripts/check-activity-view.mts
import { notableReason, pullFacts, rateStats, categoryOf } from '../lib/activity-view';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const min = (m: number) => NOW - m * 60_000;
const pull = (m: number, over: Record<string, unknown> = {}) => ({ type: 'pull', cardNumber: 1, cardName: 'C', stars: 1, packName: 'P', isNew: false, copies: 2, uniqueOwned: 3, username: 'ann', seq: 1, at: min(m), ...over }) as never;
const grant = (m: number, over: Record<string, unknown> = {}) => ({ type: 'grant', source: 'webhook', cardNumber: 1, username: 'bob', seq: 2, at: min(m), stars: 5, isNew: true, ...over }) as never;
const adminGrant = (m: number) => ({ type: 'grant', source: 'admin', cardNumber: 1, username: 'cy', seq: 3, at: min(m) }) as never;

ok(pullFacts(pull(1)) !== null && pullFacts(grant(1)) !== null && pullFacts(adminGrant(1)) === null, 'pulls and webhook grants are pulls; admin grants are not');
ok(categoryOf(grant(1)) === 'pulls' && categoryOf(adminGrant(1)) === 'grants', 'a webhook grant is filed under Pulls, an admin grant under Grants');

const base = rateStats([pull(1), pull(2)], NOW);
const withGrants = rateStats([pull(1), pull(2), grant(3), grant(4, { variant: 'shiny', isNew: false, stars: 1 }), adminGrant(1)], NOW);
ok(base.lastHour === 2 && withGrants.lastHour === 4, 'the hour count includes webhook grants and leaves out admin grants');
ok(withGrants.perMinute === 4 / 5, 'pulls per minute includes them');
ok(base.viewersLastHour === 1 && withGrants.viewersLastHour === 2, 'viewers include the person who got the grant');
ok(base.rareLastHour === 0 && withGrants.rareLastHour === 2, 'rare counts a 5 star grant and a shiny grant');
ok(base.newCardsLastHour === 0 && withGrants.newCardsLastHour === 1, 'new cards counts a new grant');
ok(withGrants.spark.reduce((a, b) => a + b, 0) === 4, 'the sparkline includes them');
ok(rateStats([grant(90)], NOW).lastHour === 0, 'old ones age out like pulls');
ok(rateStats([grant(1, { stars: undefined, isNew: undefined })], NOW).lastHour === 1, 'an older grant without the extra facts still counts');

ok(notableReason(grant(1), 25) === '5-star pull' && notableReason(grant(1, { variant: 'shiny' }), 25) === 'Full Art Holo pull' && notableReason(adminGrant(1), 25) === null, 'a rare webhook grant is highlighted like a pull');
console.log('activity view checks passed');
