# lib/card-back-patterns.ts

- PatternId · type · L11-L11 — type PatternId = (typeof PATTERN_IDS)[number];
- Blend · type · L18-L18 — type Blend = (typeof BLENDS)[number];
- PatternSettings · interface · L20-L27 — interface PatternSettings
- isCustomPattern · function · L32-L33 — isCustomPattern = (s: Partial<PatternSettings>)
- n · function · L39-L39 — n = (v: number)
- seeded · function · L42-L45 — function seeded(seed: number): () => number
- Draw · type · L47-L47 — type Draw = (ink: string, k: number) => { cell: [number, number]; body: string; stroke?: boolean; width?: number };
- hex · function · L60-L60 — hex = (cx: number, cy: number)
- star · function · L66-L66 — star = (cx: number, cy: number, r: number)
- patternSvg · function · L87-L114 — function patternSvg(id: string, s: Partial<PatternSettings> = {}): string | null
- patternUrl · function · L117-L117 — patternUrl = (svg: string)
