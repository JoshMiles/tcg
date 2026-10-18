# lib/pronouns.ts

- PronounMode · type · L5-L5 — type PronounMode = 'none' | 'set' | 'alejo';
- Pronouns · interface · L6-L6 — interface Pronouns
- pronounLabel · function · L18-L18 — pronounLabel = (id: string | undefined): string | null
- sanitizePronouns · function · L21-L26 — function sanitizePronouns(input: unknown): Pronouns
- AlejoPronoun · interface · L29-L29 — interface AlejoPronoun
- AlejoUser · interface · L31-L31 — interface AlejoUser
- alejoLabel · function · L34-L43 — function alejoLabel(user: AlejoUser | null | undefined, table: Record<string, AlejoPronoun> | null | undefined): string | null
- part · function · L38-L38 — part = (s: unknown)
