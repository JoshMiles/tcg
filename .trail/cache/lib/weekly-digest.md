# lib/weekly-digest.ts

- DigestBoardRow · interface · L8-L8 — interface DigestBoardRow
- RankSnapshot · type · L10-L10 — type RankSnapshot = Record<string, [number, number]>;
- DigestTrade · interface · L11-L11 — interface DigestTrade
- DigestPrint · interface · L12-L12 — interface DigestPrint
- DigestInput · interface · L14-L31 — interface DigestInput
- DigestMover · interface · L33-L33 — interface DigestMover
- WeeklyDigest · interface · L35-L53 — interface WeeklyDigest
- hourMs · function · L56-L58 — function hourMs(h: string): number
- buildWeeklyDigest · function · L60-L110 — function buildWeeklyDigest(i: DigestInput): WeeklyDigest
- digestWorthPosting · function · L113-L113 — digestWorthPosting = (d: WeeklyDigest)
- snapshotRanks · function · L116-L120 — function snapshotRanks(board: DigestBoardRow[], cap = 1000): RankSnapshot
- sampleDigest · function · L123-L134 — function sampleDigest(now = Date.now()): WeeklyDigest
