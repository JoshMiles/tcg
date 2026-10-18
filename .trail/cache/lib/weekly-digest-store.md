# lib/weekly-digest-store.ts

- ranksKey · function · L17-L17 — ranksKey = (seasonId: string)
- getLatestDigest · function · L21-L23 — async function getLatestDigest(): Promise<WeeklyDigest | null>
- build · function · L26-L60 — async function build(now: number): Promise<{ digest: WeeklyDigest; snapshot: RankSnapshot; seasonId: string } | null>
- DigestOutcome · type · L62-L66 — type DigestOutcome = | { status: 'posted'; week: string; channels: number; pulls: number; trades: number } | { status: 'skipped'; week: string; reason: string } | { status: 'already'; week: string } | { status: 'error'; error: string };
- digestOncePerWeek · function · L69-L87 — async function digestOncePerWeek(now = Date.now()): Promise<DigestOutcome>
