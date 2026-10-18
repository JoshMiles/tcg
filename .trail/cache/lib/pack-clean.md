# lib/pack-clean.ts

- PackInput · interface · L6-L21 — interface PackInput
- num · function · L24-L27 — num = (v: unknown, fallback: number, min = 0, max = Infinity)
- int · function · L28-L28 — int = (v: unknown, fallback: number, min = 1)
- str · function · L29-L29 — str = (v: unknown, max = 500)
- cleanPackInput · function · L31-L59 — function cleanPackInput(i: PackInput): Omit<Pack, 'id' | 'createdAt' | 'status'>
- CardFields · interface · L64-L69 — interface CardFields
- cardProblems · function · L75-L83 — function cardProblems(c: CardFields, otherNumbers: number[]): string[]
