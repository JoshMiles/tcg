# lib/card-back-v1.ts

- BackSize · type · L8-L8 — type BackSize = (typeof SIZES)[number];
- BackElement · type · L11-L11 — type BackElement = (typeof ELEMENTS)[number];
- CardBackV1 · interface · L23-L55 — interface CardBackV1
- colour · function · L68-L75 — function colour(v: unknown, fallback: string, allow?: string): string
- num · function · L76-L76 — num = (v: unknown, lo: number, hi: number, fb: number, mul: number)
- pick · function · L77-L77 — pick = <T extends string>(v: unknown, all: readonly T[], fallback: T): T
- safeUrl · function · L80-L85 — function safeUrl(v: unknown): string
- sanitizeV1 · function · L88-L109 — function sanitizeV1(input: unknown): CardBackV1
- isDefaultV1 · function · L112-L116 — function isDefaultV1(s: CardBackV1): boolean
- PatternFields · type · L130-L130 — type PatternFields = Pick<CardBackV1, 'background' | 'bg1' | 'bg2' | 'angle' | 'pattern' | 'cover'> & Partial<Pick<CardBackV1, 'patternColor' | 'patternOpacity' | 'patternScale' | 'patternAngle' | 'patternBlend'>>;
- patternLayers · function · L133-L143 — function patternLayers(s: PatternFields): string[]
- plateBackground · function · L146-L152 — function plateBackground(s: PatternFields): string
- plateBlend · function · L155-L159 — function plateBlend(s: PatternFields): string | undefined
- cardBackVars · function · L162-L174 — function cardBackVars(s: CardBackV1, rarityHex: string): Record<string, string>
