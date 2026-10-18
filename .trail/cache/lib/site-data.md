# lib/site-data.ts

- timeAgo · function · L12-L20 — function timeAgo(at: number, now = Date.now()): string
- SeasonCard · type · L22-L22 — type SeasonCard = Card & { packName: string; pack: Pack };
- SeasonOverview · interface · L24-L29 — interface SeasonOverview
- getSeasonOverview · function · L32-L36 — async function getSeasonOverview(season: Season): Promise<SeasonOverview>
- CardArrival · type · L39-L39 — type CardArrival = Extract<ActivityEvent, { type: 'pull' | 'grant' }>;
- getRecentCardArrivals · function · L46-L52 — async function getRecentCardArrivals(collectionName: string, limit = 10): Promise<CardArrival[]>
- CardOwner · interface · L56-L63 — interface CardOwner
- ownersByCard · function · L69-L97 — function ownersByCard( collection: Record<string, number[]>, values: SeasonValues, limit = 10, hidden: Set<string> = new Set(), ): Map<number, { top: CardOwner[]; collectors: number }>
- SeasonStats · interface · L101-L114 — interface SeasonStats
- computeStats · function · L116-L147 — function computeStats(o: SeasonOverview): SeasonStats
- copiesOf · function · L117-L117 — copiesOf = (c: Card)
