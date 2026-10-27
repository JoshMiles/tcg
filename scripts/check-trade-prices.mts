// Checks the card page's recent-trades helper (ROADMAP 50.11): pure, no KV.  Run: npx tsx scripts/check-trade-prices.mts
import { recentTradesFor } from '../lib/trade-prices';
import type { Trade, TradeItem } from '../lib/trade-core';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const it = (cardNumber: number, variant: TradeItem['variant'] = 'regular', count = 1): TradeItem => ({ cardNumber, variant, count });
let n = 0;
const t = (o: Partial<Trade>): Trade => ({ id: `t${++n}`, seasonId: 's1', kind: 'direct', from: 'a', to: 'b', give: [it(1)], get: [it(2)], escrowed: false, status: 'accepted', createdAt: 1, expiresAt: 2, resolvedAt: 100 + n, ...o });

const history = [
  t({}),                                              // gave #1 for #2
  t({ give: [it(3)], get: [it(1, 'full')] }),         // the card is on the get side
  t({ status: 'declined' }),
  t({ reversedAt: 5 }),
  t({ seasonId: 's2' }),
  t({ give: [it(1), it(4)], get: [it(5)] }),          // bundle: skipped
  t({ give: [it(6)], get: [it(7)] }),                 // unrelated
];
const r = recentTradesFor(history, 's1', 1);
ok(r.length === 2, `two usable trades, got ${r.length}`);
ok(r[0].other[0].cardNumber === 2 && r[1].other[0].cardNumber === 3 && r[1].card[0].variant === 'full', "both sides are read from the card's point of view");
ok(r[0].at === history[0].resolvedAt, 'the date is the resolved time');
ok(recentTradesFor(Array.from({ length: 9 }, () => t({})), 's1', 1).length === 5, 'capped at 5');
ok(recentTradesFor(history, 's1', 99).length === 0, 'none for a card nobody traded');
console.log('ok: trade prices');
