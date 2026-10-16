// Checks the pure helpers of the admin Prints screen: what a search means, edition filters and the safe return address.
// Run: npx tsx scripts/check-serials-view.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const v = await import('../lib/serials-view');
type Copy = import('../lib/serials-core').Copy;

// ── search ──
ok(v.parsePrintSearch(undefined).kind === 'none' && v.parsePrintSearch('  ').kind === 'none', 'an empty search is nothing');
ok(JSON.stringify(v.parsePrintSearch('#1023381')) === '{"kind":"uid","uid":1023381}', '#1023381 is a print number');
ok(JSON.stringify(v.parsePrintSearch('1023381')) === '{"kind":"uid","uid":1023381}', '1023381 is a print number');
ok(v.parsePrintSearch('12').kind === 'text' && v.parsePrintSearch('999999').kind === 'text', 'short numbers are card numbers, not print numbers');
ok(v.parsePrintSearch('@Sam').kind === 'text', 'a login is free text');

// ── filters ──
const copy = (n: number, owner: string, origin: Copy['origin'] = 'pull'): Copy => ({ id: `1.0.${n}`, card: 1, variant: 'regular', n, owner, at: n, origin, ev: [] });
const list = [copy(3, 'sam'), copy(1, 'jo', 'grant'), copy(2, ''), copy(4, 'escrow:t1'), copy(5, 'sam', 'upgrade')];
ok(v.filterEditions(list, {}).map(c => c.n).join() === '1,2,3,4,5', 'editions are sorted oldest first');
ok(v.filterEditions(list, { holder: '@Sam' }).map(c => c.n).join() === '3,5', 'a holder filter ignores @ and case');
ok(v.filterEditions(list, { holder: 'retired' }).map(c => c.n).join() === '2', 'retired is a holder');
ok(v.filterEditions(list, { holder: 'offer' }).map(c => c.n).join() === '4', 'offer is a holder');
ok(v.filterEditions(list, { origin: 'grant' }).map(c => c.n).join() === '1', 'an origin filter');
ok(v.filterEditions(list, { holder: 'sam', origin: 'upgrade' }).map(c => c.n).join() === '5', 'both together');
ok(v.parseOrigin('upgrade') === 'upgrade' && v.parseOrigin('nope') === '' && v.parseOrigin(undefined) === '', 'origins are validated');

// ── where actions may return to ──
ok(v.safeSerialsReturn('/admin/serials?season=s1&card=3&v=full&print=3.2.7') === '/admin/serials?season=s1&card=3&v=full&print=3.2.7', 'the list with filters is allowed');
for (const bad of ['https://evil.test/', '//evil.test', '/admin/users', '/admin/serials/s1/1.0.1', '/admin/serials?x=<script>', '/admin/serials?a=b c', '', 5, null, undefined, '/admin/serials?' + 'a'.repeat(700)]) {
  ok(v.safeSerialsReturn(bad) === null, `refused: ${String(bad).slice(0, 40)}`);
}
ok(v.withParams('/admin/serials?season=s1&print=1.0.1', { print: '2.0.3', done: 'Given to @jo.' }) === '/admin/serials?season=s1&print=2.0.3&done=Given+to+%40jo.', 'withParams sets and encodes');
ok(v.withParams('/admin/serials?season=s1&done=x', { done: undefined }) === '/admin/serials?season=s1', 'withParams removes');
ok(v.safeSerialsReturn(v.withParams('/admin/serials?season=s1', { print: '1.0.1' })) !== null, 'what withParams builds is still a safe address');
// ── Most valuable prints links (15.4) ──
const { topPrintHref } = await import('../lib/copy-link');
const row = (serial?: number, variant: 'regular' | 'shiny' = 'shiny') => ({ card: { number: 7 }, variant, serial });
ok(topPrintHref(row(3), 's1', 1023381) === '/c/1023381', 'a numbered print with a unique number opens its print page');
ok(topPrintHref(row(3), 's1', null) === '/copy/s1/7.3.3', 'a numbered print without a unique number opens the derived copy link');
ok(topPrintHref(row(undefined), 's1', 5) === '/cards?card=7', 'a grouped row opens the card dex dialog');
console.log('ok');
