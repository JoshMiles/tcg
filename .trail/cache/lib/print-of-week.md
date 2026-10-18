# lib/print-of-week.ts

- PotwParts · interface · L14-L22 — interface PotwParts
- Scored · interface · L24-L24 — interface Scored
- PotwPick · interface · L27-L27 — interface PotwPick
- plural · function · L29-L29 — plural = (n: number, one: string, many = `${one}s`)
- reasonText · function · L32-L39 — function reasonText(p: PotwParts): string
- scorePrint · function · L45-L58 — function scorePrint(copy: Pick<Copy, 'ev' | 'owner' | 'at' | 'n' | 'variant' | 'origin' | 'madeFrom' | 'uid'>, now = Date.now()): Scored | null
- Candidate · interface · L60-L60 — interface Candidate extends Scored
- pickPrintOfWeek · function · L63-L68 — function pickPrintOfWeek(candidates: Candidate[], recentUids: number[]): Candidate | null
- PotwHistoryEntry · interface · L70-L70 — interface PotwHistoryEntry
- pushHistory · function · L73-L73 — pushHistory = (history: PotwHistoryEntry[], uid: number, at: number): PotwHistoryEntry[]
- recentUids · function · L76-L76 — recentUids = (history: PotwHistoryEntry[], now = Date.now()): number[]
- isoWeekKey · function · L79-L86 — function isoWeekKey(ms: number): string
