# lib/score-history.ts

- key · function · L4-L4 — key = (u: string, seasonId: string)
- getScoreHistory · function · L7-L9 — async function getScoreHistory(username: string, seasonId: string): Promise<ScoreSample[]>
- recordScoreSample · function · L12-L23 — async function recordScoreSample(username: string, seasonId: string, score: number, rank: number | null, now = Date.now()): Promise<ScoreSample[]>
