# lib/serials-view.ts

- PrintSearch · type · L6-L9 — type PrintSearch = | { kind: 'none' } | { kind: 'uid'; uid: number } | { kind: 'text'; text: string };
- parsePrintSearch · function · L12-L17 — function parsePrintSearch(raw: string | undefined): PrintSearch
- parseOrigin · function · L20-L20 — parseOrigin = (v: string | undefined): Origin | ''
- cleanHolder · function · L21-L21 — cleanHolder = (v: string | undefined)
- filterEditions · function · L24-L35 — function filterEditions(copies: Copy[], f: { holder?: string; origin?: Origin | '' }): Copy[]
- safeSerialsReturn · function · L38-L42 — function safeSerialsReturn(raw: unknown): string | null
- withParams · function · L45-L51 — function withParams(base: string, set: Record<string, string | undefined>): string
