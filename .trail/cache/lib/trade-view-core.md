# lib/trade-view-core.ts

- TradeCardInfo · interface · L11-L26 — interface TradeCardInfo
- copyValue · function · L29-L34 — function copyValue(card: TradeCardInfo | undefined, variant: Variant, serial?: number): number
- PrintInfo · interface · L37-L37 — interface PrintInfo
- PrintPool · type · L39-L39 — type PrintPool = Record<number, PrintInfo[]>;
- printPoolOf · function · L42-L47 — function printPoolOf(copies: { id: string; n: number; uid?: number; card: number; variant: Variant }[]): PrintPool
- PickProps · interface · L50-L50 — interface PickProps
- pickPropsFor · function · L53-L57 — function pickPropsFor(trade: { seasonId: string; get: TradeItem[] }, viewer: string | null | undefined, cards: Record<number, TradeCardInfo>): PickProps | undefined
- newestIds · function · L60-L60 — newestIds = (prints: PrintInfo[] | undefined, count: number): string[]
- TradePools · interface · L63-L71 — interface TradePools
- poolsFor · function · L74-L77 — function poolsFor(trade: { id: string; from: string }, pools?: TradePools): { give?: SerialPool; get?: SerialPool }
- stackPoints · function · L84-L92 — function stackPoints(items: TradeItem[], cards: Record<number, TradeCardInfo>, pool?: SerialPool): number
- timeLeft · function · L95-L102 — function timeLeft(expiresAt: number, now = Date.now()): string
