# lib/variants.ts

- encodeEntry · function · L23-L25 — function encodeEntry(cardNumber: number, variant: Variant = 'regular'): number
- decodeEntry · function · L27-L30 — function decodeEntry(entry: number): { cardNumber: number; variant: Variant }
- VariantCounts · type · L32-L32 — type VariantCounts = Record<Variant, number>;
- emptyCounts · function · L34-L36 — function emptyCounts(): VariantCounts
- countVariants · function · L39-L48 — function countVariants(owned: number[]): Map<number, VariantCounts>
- nextVariant · function · L50-L52 — function nextVariant(variant: Variant): Variant | null
- upgradesAllowed · function · L55-L57 — function upgradesAllowed(pack: Pick<Pack, 'upgradesEnabled'>, card: Pick<Card, 'upgradesEnabled'>): boolean
- cleanDisabled · function · L60-L63 — function cleanDisabled(input: unknown): OptionalVariant[]
- allowedVariants · function · L66-L69 — function allowedVariants(pack: Pick<Pack, 'disabledVariants'>, card?: Pick<Card, 'disabledVariants'>): Variant[]
- effectiveWeights · function · L72-L77 — function effectiveWeights(pack: Pick<Pack, 'variantWeights' | 'disabledVariants'>, card?: Pick<Card, 'disabledVariants'>): VariantWeights
- upgradeStep · function · L84-L97 — function upgradeStep( pack: Pick<Pack, 'disabledVariants' | 'upgradeCosts'>, card: Pick<Card, 'disabledVariants'> | undefined, from: Variant, ): { to: Variant; cost: number } | null
- rollVariant · function · L100-L109 — function rollVariant(weights: VariantWeights, rand: () => number = Math.random): Variant
- removeEntries · function · L112-L121 — function removeEntries(owned: number[], entry: number, n: number): number[] | null
