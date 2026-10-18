# lib/trade-match.ts

- MatchViewer · interface · L8-L13 — interface MatchViewer
- MatchInfo · interface · L15-L28 — interface MatchInfo
- ownsAny · function · L30-L30 — ownsAny = (copies: Map<number, number>, card: number)
- matchTrade · function · L32-L51 — function matchTrade(trade: Trade, viewer: MatchViewer, cards: Record<number, TradeCardInfo>, pools?: TradePools): MatchInfo
- bestMatches · function · L54-L60 — function bestMatches(trades: Trade[], viewer: MatchViewer, cards: Record<number, TradeCardInfo>, limit = 5, pools?: TradePools): MatchInfo[]
- fairness · function · L63-L70 — function fairness(givePts: number, getPts: number): { label: 'Even' | 'Slightly in their favour' | 'Slightly in your favour' | 'Lopsided against you' | 'Generous to them' | 'Empty'; warn: boolean }
