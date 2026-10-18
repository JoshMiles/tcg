# lib/favourites.ts

- favouriteIdsOf · function · L11-L16 — async function favouriteIdsOf(collection: string, owner: string): Promise<Set<string>>
- Spend · type · L18-L18 — type Spend = { ok: true; ids: string[] | null } | { ok: false; text: string };
- spendablePrints · function · L25-L41 — async function spendablePrints(collection: string, owner: string, entry: number, count: number, picked: string[] | undefined, favs: Set<string>, verb: 'trade' | 'spend' = 'trade'): Promise<Spend>
- protectFavourites · function · L44-L55 — async function protectFavourites(collection: string, owner: string, items: TradeItem[]): Promise<{ ok: true; items: TradeItem[] } | { ok: false; text: string }>
