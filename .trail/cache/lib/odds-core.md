# lib/odds-core.ts

- OddsCard · interface · L6-L6 — interface OddsCard
- VariantWeights · type · L7-L7 — type VariantWeights = Record<Variant, number>;
- r4 · function · L11-L11 — r4 = (n: number)
- normalizeWeights · function · L14-L17 — function normalizeWeights(cards: OddsCard[]): Record<string, number>
- balanceByRarity · function · L20-L26 — function balanceByRarity(cards: OddsCard[], targets: Record<number, number>): Record<string, number>
- want · function · L23-L23 — want = (s: number)
- makePicker · function · L29-L40 — function makePicker(weights: number[], random: () => number = Math.random): () => number
- SimResult · interface · L42-L49 — interface SimResult
- simulate · function · L52-L82 — function simulate(cards: OddsCard[], variantWeights: (id: string) => VariantWeights | undefined, upgrades: boolean, runs: number, random: () => number = Math.random): SimResult | null
- pickVariant · function · L59-L65 — pickVariant = (c: OddsCard): Variant
