// Checks the big-reversal trial rule (ROADMAP 51.7): what counts as big, and the 14-day count read from audit entries.
// Pure, no KV. Run: npx tsx scripts/check-big-reversal.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { isBigReversal, BIG_TRADE_PRINTS, SECOND_APPROVAL_NOTE } = await import('../lib/trade-core');
const { countBigReversals } = await import('../lib/audit');

const it = (variant: string, count: number) => ({ variant, count });
ok(!isBigReversal({ give: [it('regular', 1)], get: [it('reverse', 1)] }), 'a small swap is not big');
ok(isBigReversal({ give: [it('golden', 1)], get: [] }), 'any golden print is big');
ok(isBigReversal({ give: [], get: [it('golden', 1)] }), 'golden on either side is big');
ok(!isBigReversal({ give: [it('regular', BIG_TRADE_PRINTS - 3)], get: [it('shiny', 2)] }), 'one print under the limit is not big');
ok(isBigReversal({ give: [it('regular', BIG_TRADE_PRINTS - 3)], get: [it('shiny', 3)] }), 'prints add up across both sides');

const now = Date.UTC(2026, 9, 27);
const DAY = 86400000;
const e = (action: string, at: number, detail: string) => ({ at, username: 'a', action, detail });
const entries = [
  e('Trade reversed', now - DAY, `aaaaaaaa (${SECOND_APPROVAL_NOTE}) with b: x`),
  e('Trade reversed', now - DAY, `aaaaaaaa (${SECOND_APPROVAL_NOTE}) with a: x`), // the other person's entry for the same trade
  e('Trade reversed', now - DAY, 'bbbbbbbb with c: small'),
  e('Trade reversed', now - 15 * DAY, `cccccccc (${SECOND_APPROVAL_NOTE}) with d: old`),
  e('Card removed', now - DAY, `dddddddd (${SECOND_APPROVAL_NOTE})`),
];
ok(countBigReversals(entries, now) === 1, 'counts one big reversal: two entries for one trade, small, old and other actions left out');
console.log('big reversal checks passed');
