// Pure checks for the flip card's engraved back. Run: npx tsx scripts/check-flip-back.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { engravedDate, madeLine } = await import('../lib/flip-back');
ok(engravedDate(Date.UTC(2026, 9, 12, 23, 59)) === '12 OCT 2026', 'date is UTC and upper-case');
ok(engravedDate(Date.UTC(2026, 0, 1, 0, 0)) === '1 JAN 2026', 'no zero padding');
ok(madeLine(7, 1234) === 'of 1,234 made', 'total is grouped');
ok(madeLine(7) === '' && madeLine(9, 4) === '', 'unknown or impossible totals print nothing');
const { editionLine } = await import('../lib/flip-back');
ok(editionLine(7, 12) === 'Edition #7 of 12 made' && editionLine(7) === 'Edition #7', 'edition line');
const core = await import('../lib/serials-core');
ok(core.parseUid('#1023381') === 1023381 && core.parseUid(' 1023381 ') === 1023381, 'unique numbers parse with or without #');
ok(core.parseUid('12') === null && core.parseUid('1000000') === null && core.parseUid('12345678901') === null && core.parseUid('abc') === null, 'short, base and huge numbers are not copy numbers');
// A copy is never "created" or "made for" someone: every origin has a verb and a "by" phrase.
for (const o of ['pull', 'grant', 'upgrade', 'estimated', 'other'] as const) {
  ok(!!core.ORIGIN_VERB[o] && !!core.ORIGIN_BY[o] && !core.ORIGIN_VERB[o].includes('Creat') && !core.ORIGIN_BY[o].includes('made'), `origin ${o} has plain wording`);
}
ok(core.ORIGIN_BY.pull === 'pulled by' && core.ORIGIN_BY.grant === 'given to' && core.ORIGIN_BY.upgrade === 'forged by', 'the three real origins read pulled by / given to / forged by');
ok(core.ORIGIN_BY.estimated === 'first held by', 'a numbered-later copy is not said to have been pulled');

console.log('flip back checks passed');
