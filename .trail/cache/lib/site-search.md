# lib/site-search.ts

- SearchKind · type · L7-L7 — type SearchKind = 'page' | 'player' | 'card' | 'copy';
- SearchItem · interface · L9-L19 — interface SearchItem
- cleanQuery · function · L40-L42 — function cleanQuery(raw: string): string
- buildEntityItems · function · L45-L56 — function buildEntityItems( usernames: string[], hidden: Set<string>, cards: { number: number; name: string; stars: number; thumb?: string }[], ): SearchItem[]
- rankSearch · function · L59-L77 — function rankSearch(items: SearchItem[], rawQuery: string, limit = 10): SearchItem[]
