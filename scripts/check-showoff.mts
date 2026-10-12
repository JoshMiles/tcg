// Checks the show-off command's parsing and card matching. Pure.  Run: npx tsx scripts/check-showoff.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const s = await import('../lib/showoff');

eq(s.parseShowQuery('shiny gouda goat'), { number: null, name: 'gouda goat', variant: 'shiny' }, 'variant first');
eq(s.parseShowQuery('Gouda Goat SH'), { number: null, name: 'Gouda Goat', variant: 'shiny' }, 'variant last, any case');
eq(s.parseShowQuery('#12 reverse'), { number: 12, name: '', variant: 'reverse' }, 'number and version');
eq(s.parseShowQuery('12'), { number: 12, name: '', variant: null }, 'a bare number');
eq(s.parseShowQuery('full art brie'), { number: null, name: 'brie', variant: 'full' }, '"full art" is one version');
eq(s.parseShowQuery('Shiny Full Art Gouda Goat'), { number: null, name: 'Gouda Goat', variant: 'shiny' }, '"shiny full art" is the shiny version');
eq(s.parseShowQuery('reverse holo cat'), { number: null, name: 'cat', variant: 'reverse' }, '"reverse holo"');
eq(s.parseShowQuery('shiny'), { number: null, name: 'shiny', variant: null }, 'a lone word is a card name');
eq(s.parseShowQuery(''), { number: null, name: '', variant: null }, 'empty means my best card');
eq(s.parseShowQuery(undefined), { number: null, name: '', variant: null }, 'missing');
eq(s.parseShowQuery(7), { number: 7, name: '', variant: null }, 'a number value');
eq(s.parseShowQuery('x'.repeat(500)).name.length, 80, 'long input is cut');

const cards = [
  { number: 1, name: 'Cheesy Cat', stars: 1 }, { number: 2, name: 'Cheesy Chicken', stars: 2 }, { number: 3, name: 'Gouda Goat', stars: 5 }, { number: 4, name: 'Brie Bear', stars: 3 },
];
const owned = new Set([1, 2, 3]);
const best = () => cards[2];
const r = (q: string) => s.resolveCard(s.parseShowQuery(q), cards, owned, best);

eq(r('gouda goat'), { ok: true, card: cards[2] }, 'exact name');
eq(r('gouda'), { ok: true, card: cards[2] }, 'part of a name');
eq((r('cheesy') as { ok: boolean; reason?: string }).reason, 'ambiguous', 'two owned cards match');
eq(r('cheesy cat'), { ok: true, card: cards[0] }, 'a longer name settles it');
const oneOwned = s.resolveCard(s.parseShowQuery('cheesy'), cards, new Set([2]), best);
eq(oneOwned, { ok: true, card: cards[1] }, 'when only one match is owned, that one wins');
eq((r('brie') as { reason?: string }).reason, 'not-owned', 'a card they do not own');
eq((r('nonsense') as { reason?: string }).reason, 'none', 'no such card');
eq(r('#3'), { ok: true, card: cards[2] }, 'by number');
eq((r('#9') as { reason?: string }).reason, 'none', 'unknown number');
eq(r(''), { ok: true, card: cards[2] }, 'no query shows their best card');
eq((s.resolveCard(s.parseShowQuery(''), cards, new Set(), () => null) as { reason?: string }).reason, 'nothing-to-show', 'no cards at all');

const counts = (o: Partial<Record<'regular' | 'reverse' | 'full' | 'shiny', number>>) => ({ regular: 0, reverse: 0, full: 0, shiny: 0, ...o });
eq(s.pickShowVariant(counts({ regular: 2, reverse: 1 }), null), { ok: true, variant: 'reverse' }, 'no preference shows the best version owned');
eq(s.pickShowVariant(counts({ regular: 2, reverse: 1 }), 'regular'), { ok: true, variant: 'regular' }, 'an owned version is honoured');
const no = s.pickShowVariant(counts({ regular: 2 }), 'shiny') as { ok: boolean; message: string };
ok(!no.ok && no.message.includes('Shiny') && no.message.includes('Regular'), 'a version they do not own says what they do have');
console.log('showoff checks passed');
