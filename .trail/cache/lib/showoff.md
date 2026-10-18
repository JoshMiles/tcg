# lib/showoff.ts

- norm · function · L14-L14 — norm = (s: string)
- ShowQuery · interface · L16-L21 — interface ShowQuery
- parseShowQuery · function · L24-L39 — function parseShowQuery(raw: unknown): ShowQuery
- ShowCard · interface · L41-L41 — interface ShowCard
- Resolved · type · L43-L45 — type Resolved = | { ok: true; card: ShowCard } | { ok: false; reason: 'none' | 'not-owned' | 'ambiguous' | 'nothing-to-show'; message: string; candidates?: string[] };
- resolveCard · function · L51-L71 — function resolveCard(q: ShowQuery, cards: ShowCard[], owned: ReadonlySet<number>, best: () => ShowCard | null): Resolved
- pickShowVariant · function · L74-L82 — function pickShowVariant(counts: VariantCounts, wanted: Variant | null): { ok: true; variant: Variant } | { ok: false; message: string }
