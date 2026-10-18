# lib/trade-insights.ts

- copies · function · L8-L8 — copies = (items: TradeItem[])
- TradeStats · interface · L10-L29 — interface TradeStats
- partnerOf · function · L32-L32 — partnerOf = (t: Trade): string | undefined
- computeTradeStats · function · L34-L74 — function computeTradeStats(open: Trade[], history: Trade[], now: number, days = 14): TradeStats
- dayKey · function · L42-L42 — dayKey = (ms: number)
- FlagKind · type · L78-L78 — type FlagKind = 'lopsided' | 'repeat' | 'burst' | 'newbie';
- TradeFlag · interface · L79-L79 — interface TradeFlag
- FlagContext · interface · L96-L101 — interface FlagContext
- flagTrades · function · L104-L152 — function flagTrades(trades: Trade[], ctx: FlagContext): Map<string, TradeFlag[]>
- add · function · L106-L106 — add = (id: string, f: TradeFlag)
- TradeRow · interface · L157-L186 — interface TradeRow
- tradesToCsv · function · L188-L193 — function tradesToCsv(rows: TradeRow[]): string
- esc · function · L189-L189 — esc = (v: unknown)
