# lib/trade-notify.ts

- noticesKey · function · L25-L25 — noticesKey = (u: string)
- seenKey · function · L26-L26 — seenKey = (u: string)
- versionKey · function · L27-L27 — versionKey = (u: string)
- EventPools · interface · L33-L33 — interface EventPools
- TradeAction · type · L35-L35 — type TradeAction = 'offered' | 'countered' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'reversed';
- notify · function · L37-L48 — async function notify(username: string, notice: Omit<Notice, 'id' | 'at'>): Promise<void>
- listNotices · function · L51-L58 — async function listNotices(username: string): Promise<{ notices: Notice[]; seen: number }>
- getNoticeVersion · function · L61-L63 — async function getNoticeVersion(username: string): Promise<number>
- markNoticesSeen · function · L65-L71 — async function markNoticesSeen(username: string): Promise<void>
- stackLines · function · L74-L76 — function stackLines(items: TradeItem[], cards: Record<number, TradeCardInfo>): string[]
- withEditions · function · L79-L85 — function withEditions(items: TradeItem[], lines: string[], pool?: SerialPool): string[]
- buildSwap · function · L88-L102 — async function buildSwap(seasonId: string, gave: TradeItem[], got: TradeItem[], withUser: string): Promise<Swap | undefined>
- toCards · function · L94-L97 — toCards = (items: TradeItem[]): SwapCard[]
- announceTrade · function · L108-L171 — async function announceTrade(trade: Trade, action: TradeAction, by?: string, pools: EventPools = {}): Promise<void>
- tell · function · L123-L124 — tell = (user: string | undefined, kind: NoticeKind, text: string, swap?: Swap)
- text · function · L159-L159 — text = (other: string)
- notifyWatchers · function · L179-L190 — async function notifyWatchers(trade: Trade, cards: Record<number, TradeCardInfo>): Promise<void>
