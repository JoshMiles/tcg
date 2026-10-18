# lib/watch-index.ts

- setKey · function · L12-L12 — setKey = (card: number)
- syncWatchIndex · function · L16-L24 — async function syncWatchIndex(username: string, prev: Pick<UserSettings, 'wanted' | 'watches'> | null, next: Pick<UserSettings, 'wanted' | 'watches'>): Promise<void>
- ensureIndex · function · L26-L31 — async function ensureIndex(): Promise<void>
- watchersOf · function · L34-L41 — async function watchersOf(cards: number[]): Promise<string[]>
- watcherCounts · function · L44-L51 — async function watcherCounts(cards: number[]): Promise<Record<number, number>>
- watchersByCard · function · L54-L61 — async function watchersByCard(cards: number[]): Promise<Record<number, string[]>>
- wantedForTrades · function · L64-L74 — async function wantedForTrades(trades: Trade[]): Promise<Record<string, Record<number, number>>>
