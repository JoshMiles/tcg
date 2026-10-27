// Checks the season pre-flight (ROADMAP 51.12): every rule, and a clean season with no findings. Pure, no KV. Run: npx tsx scripts/check-season-preflight.mts
import { seasonPreflight } from '../lib/season-preflight';
import type { Card, Pack, Season } from '../lib/types';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const season = { id: 's1', name: 'S1', collectionName: 'S1', active: false, status: 'published', createdAt: 0, maxConcurrentPacks: 1, packIds: ['p1'] } as unknown as Season;
const pack = (o: Partial<Pack> = {}) => ({ id: 'p1', name: 'Base', coverImageUrl: 'c.png', active: true, status: 'published', weight: 1, upgradesEnabled: false, variantWeights: { regular: 1, reverse: 0, full: 0, shiny: 0, golden: 0 }, ...o }) as unknown as Pack;
const card = (n: number, o: Partial<Card> = {}) => ({ id: `c${n}`, number: n, name: `Card ${n}`, imageUrl: `${n}.png`, probability: 10, stars: 1, ...o }) as Card;
const run = (packs: Pack[], cards: Card[], s = season) => seasonPreflight(s, packs, () => cards);

ok(run([pack()], [card(1), card(2, { stars: 2 })]).length === 0, 'a clean season has no findings');

ok(run([], []).some(i => i.level === 'error' && /no packs/.test(i.message)), 'no packs is an error');
ok(run([pack({ active: false })], [card(1)]).some(i => i.level === 'error' && /published and active/.test(i.message)), 'no live packs is an error');
const empty = run([pack()], []);
ok(empty.length === 1 && empty[0].level === 'error' && /no cards/.test(empty[0].message) && empty[0].href === '/admin/packs/p1', 'a live pack with no cards is an error linking to the pack');
const art = run([pack()], [card(1, { imageUrl: '' }), card(2)]);
ok(art.length === 1 && art[0].level === 'warning' && /no image/.test(art[0].message), 'a card with no art is a warning');
const zero = run([pack()], [card(1, { probability: 0 }), card(2)]);
ok(zero.length === 1 && zero[0].level === 'warning' && /0 odds/.test(zero[0].message), 'one card at 0 odds is a warning');
const allZero = run([pack()], [card(1, { probability: 0 }), card(2, { probability: 0 })]);
ok(allZero.length === 1 && allZero[0].level === 'error' && /every card has 0 odds/.test(allZero[0].message), 'all cards at 0 odds is one error');
const gap = run([pack()], [card(1), card(3, { stars: 3 })]);
ok(gap.length === 1 && gap[0].level === 'warning' && /2-star tier\./.test(gap[0].message), 'an empty star tier below the top one is a warning');
ok(run([pack({ upgradesEnabled: true, variantWeights: { regular: 0, reverse: 0, full: 0, shiny: 0 } as Pack['variantWeights'] })], [card(1)]).some(i => i.level === 'error' && /variant weight/.test(i.message)), 'all variant weights at 0 is an error');
const past = run([pack()], [card(1)], { ...season, endsAt: Date.now() - 1000 });
ok(past.length === 1 && past[0].level === 'warning' && /end date/.test(past[0].message), 'a past end date is a warning');
const mixed = seasonPreflight(season, [pack(), pack({ id: 'p2', name: 'Empty' })], id => (id === 'p1' ? [card(1, { imageUrl: '' })] : []));
ok(mixed.length === 2 && mixed[0].level === 'error' && mixed[1].level === 'warning', 'errors are listed before warnings');

console.log('season pre-flight checks passed');
