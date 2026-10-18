# lib/print-of-week-store.ts

- getPotw · function · L16-L18 — async function getPotw(): Promise<PotwPick | null>
- getHistory · function · L20-L22 — async function getHistory(): Promise<PotwHistoryEntry[]>
- ScanResult · interface · L24-L24 — interface ScanResult
- ScanSummary · type · L25-L25 — type ScanSummary = Omit<ScanResult, 'candidates'> & { candidates: number };
- scanSeason · function · L28-L44 — async function scanSeason(season: Season, now = Date.now()): Promise<ScanResult>
- store · function · L46-L49 — async function store(pick: PotwPick, now: number): Promise<void>
- PickOutcome · type · L51-L51 — type PickOutcome = { ok: true; pick: PotwPick; scan: ScanSummary } | { ok: false; reason: string };
- pickNow · function · L54-L64 — async function pickNow(by: string, now = Date.now()): Promise<PickOutcome>
- WeeklyOutcome · type · L66-L69 — type WeeklyOutcome = | { status: 'picked'; pick: PotwPick; scan: ScanSummary } | { status: 'already'; week: string } | { status: 'none'; reason: string };
- pickOncePerWeek · function · L72-L85 — async function pickOncePerWeek(now = Date.now()): Promise<WeeklyOutcome>
- featureCopy · function · L88-L95 — async function featureCopy(season: Season, copy: Copy, by: string, now = Date.now()): Promise<string | null>
- clearPotw · function · L97-L99 — async function clearPotw(): Promise<void>
- FeaturedPrint · interface · L101-L101 — interface FeaturedPrint
- loadFeatured · function · L104-L116 — async function loadFeatured(): Promise<FeaturedPrint | null>
