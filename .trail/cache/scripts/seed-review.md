# scripts/seed-review.mts

- Variant · type · L31-L31 — type Variant = import('../lib/types').Variant;
- Pack · type · L32-L32 — type Pack = import('../lib/types').Pack;
- Card · type · L33-L33 — type Card = import('../lib/types').Card;
- say · function · L35-L35 — say = (m: string)
- must · function · L36-L36 — must = <T,>(v: T | null | undefined, what: string): T
- all · function · L70-L70 — all = (n: number, v: Variant, count = 1)
- grant · function · L71-L71 — grant = async (user: string, entries: number[])
- cardOf · function · L97-L97 — cardOf = (e: number)
- item · function · L99-L99 — item = (n: number)
- pick · function · L117-L117 — pick = <T,>(xs: T[])
