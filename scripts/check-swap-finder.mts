// Checks the swap finder's matching rules. Pure.  Run: npx tsx scripts/check-swap-finder.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const { findSwaps } = await import('../lib/swap-finder');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'shiny' = 'regular') => encodeEntry(n, v);

// The viewer has 2x card 1 (a spare) and 1x card 2 (their last copy), and is looking for cards 7 and 8.
const mine = [E(1), E(1), E(2)];
const wanted = [7, 8];
const board = {
  me: [E(7)],
  ann: [E(7), E(7)],            // holds a spare of 7, wants card 1
  bob: [E(8)],                  // holds a single 8, wants card 1
  cat: [E(7)],                  // holds 7 but only wants card 2 (the viewer's last copy)
  dan: [E(5)],                  // wants card 1 but holds nothing on the list
  eve: [E(7), E(8)],            // wants card 1, holds a single 7 and a single 8
  hal: [E(7)],                  // skipped
};
const watchers = { 1: ['ann', 'bob', 'dan', 'eve', 'hal', 'me'] };
const skip = (u: string) => u === 'me' || u === 'hal';

const found = findSwaps(mine, wanted, board, watchers, skip);
eq(found.map(f => f.username), ['ann', 'eve', 'bob'], 'spare holders first, then more pairs, then name; no last-copy, off-list, or skipped people');
eq(found[0].pairs, [{ have: E(7), give: E(1), theirSpare: true }], 'the pair names their card and the viewer\'s spare');
eq(found[1].pairs.map(p => p.have), [E(7), E(8)], 'extra pairs follow in Looking for order');
ok(found.slice(1).every(f => f.pairs.every(p => !p.theirSpare)), 'single copies are marked as their only copy');

// A last copy is never offered, even when someone wants it.
eq(findSwaps([E(2)], wanted, board, { 2: ['cat'] }, skip), [], 'a viewer with no spare gets no suggestions');
// A spare of one version does not make the other version a spare.
eq(findSwaps([E(1), E(1, 'shiny')], wanted, board, watchers, skip), [], 'one copy each of two versions is not a spare');
eq(findSwaps([E(1, 'shiny'), E(1, 'shiny'), E(1)], wanted, board, watchers, skip)[0].pairs[0].give, E(1, 'shiny'), 'the spare version is the one offered');
// Nothing to look for, nothing to find.
eq(findSwaps(mine, [], board, watchers, skip), [], 'an empty Looking for list finds nobody');

// Trades keep `via` only when it is exactly 'swap' (the stats count them).
const { computeTradeStats } = await import('../lib/trade-insights');
const t = (id: string, status: string, via?: string) => ({ id, seasonId: 's', kind: 'direct', from: 'a', to: 'b', give: [], get: [], escrowed: false, status, createdAt: 1, expiresAt: 2, ...(via ? { via } : {}) }) as never;
eq(computeTradeStats([t('o', 'open', 'swap')], [t('h1', 'accepted', 'swap'), t('h2', 'declined', 'swap'), t('h3', 'accepted')], 10).swap, { offered: 3, completed: 1 }, 'swap offers and completions are counted');
console.log('ok');
