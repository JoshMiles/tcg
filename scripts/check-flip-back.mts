// Pure checks for the flip card's engraved back. Run: npx tsx scripts/check-flip-back.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { engravedDate, madeLine } = await import('../lib/flip-back');
ok(engravedDate(Date.UTC(2026, 9, 12, 23, 59)) === '12 OCT 2026', 'date is UTC and upper-case');
ok(engravedDate(Date.UTC(2026, 0, 1, 0, 0)) === '1 JAN 2026', 'no zero padding');
ok(madeLine(7, 1234) === 'of 1,234 made', 'total is grouped');
ok(madeLine(7) === '' && madeLine(9, 4) === '', 'unknown or impossible totals print nothing');
console.log('flip back checks passed');
