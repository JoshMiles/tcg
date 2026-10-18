# lib/dex-view.ts

- DexShow · type · L3-L3 — type DexShow = 'all' | 'collected' | 'missing' | 'wanted' | 'undiscovered';
- DexSort · type · L4-L4 — type DexSort = 'number' | 'rarity' | 'value' | 'copies' | 'collectors' | 'name' | 'missing';
- DexRow · interface · L10-L16 — interface DexRow
- DexFilter · interface · L18-L18 — interface DexFilter
- applyDex · function · L24-L55 — function applyDex<T extends DexRow>(cards: T[], f: DexFilter): T[]
- keep · function · L26-L37 — keep = (c: T): boolean
- key · function · L38-L48 — key = (c: T): number | string
- dexProgress · function · L58-L61 — function dexProgress(cards: DexRow[]): { owned: number; total: number; pct: number }
