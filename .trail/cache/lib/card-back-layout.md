# lib/card-back-layout.ts

- BackNode · interface · L7-L29 — interface BackNode
- LayoutOptions · interface · L31-L31 — interface LayoutOptions
- hexOr · function · L33-L33 — hexOr = (c: string, rarity: string, auto: string)
- resolveTemplate · function · L37-L43 — function resolveTemplate(t: string, back: FlipBack, style: CardBackStyle): string
- effectsCss · function · L46-L61 — function effectsCss(fx: Effects, hex: string, cardW: number): Record<string, string | number>
- content · function · L64-L78 — function content(e: BackEl, back: FlipBack, style: CardBackStyle, compact: boolean): Partial<BackNode> | null
- layoutBack · function · L81-L134 — function layoutBack(style: CardBackStyle, back: FlipBack, size: { w: number; h: number }, opts: LayoutOptions = {}): BackNode[]
- fontsNeeded · function · L137-L141 — function fontsNeeded(nodes: BackNode[]): { id: string; weight: number }[]
