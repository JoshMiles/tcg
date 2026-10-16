// Checks the profile "Recent pulls" picking (pure). Run: npx tsx scripts/check-recent-pulls.mts
import { pickRecentPulls, pullFate } from '../lib/recent-pulls-core';
import type { Copy } from '../lib/serials-core';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const cp = (n: number, o: Partial<Copy> = {}): Copy => ({
  id: `1.0.${n}`, card: 1, variant: 'regular', n, owner: 'amy', at: n * 1000, origin: 'pull', ev: [{ t: n * 1000, type: 'minted', who: 'amy' }], ...o,
});

// only what she pulled, newest first, each once
const mixed = [cp(1), cp(2, { origin: 'grant' }), cp(3, { owner: 'bob' }), cp(4, { ev: [{ t: 1, type: 'minted', who: 'bob' }] }), cp(5, { owner: '', ev: [{ t: 1, type: 'minted', who: 'amy' }, { t: 2, type: 'upgraded', who: 'amy' }] }), cp(3, { owner: 'bob' })];
const got = pickRecentPulls(mixed, 'amy');
eq(got.map(c => c.n), [5, 3, 2, 1], 'pulls and grants (nobody else\'s), newest first, once each');
eq(got.map(c => c.fate), ['forged', 'traded', 'held', 'held'], 'what became of each');
eq(got.map(c => c.origin), ['pull', 'pull', 'grant', 'pull'], 'origin is kept so grants can be labelled');
eq(got.map(c => c.origin), ['pull', 'pull', 'grant', 'pull'], 'origin is kept so grants can be labelled');
eq(pickRecentPulls(Array.from({ length: 12 }, (_, i) => cp(i + 1)), 'amy').length, 8, 'at most 8');
eq(pullFate(cp(1, { owner: 'escrow:t1' }), 'amy'), 'offer', 'in an offer');
eq(pullFate(cp(1, { owner: '', ev: [{ t: 1, type: 'minted' }, { t: 2, type: 'removed' }] }), 'amy'), 'removed', 'taken out');
eq(pickRecentPulls([], 'amy'), [], 'nothing pulled');
console.log('ok');
