# lib/stats.ts

- Metric · type · L8-L8 — type Metric = 'pull' | 'newCard' | 'newViewer' | 'upgrade' | 'trade' | 'grant' | 'v:reverse' | 'v:full' | 'v:shiny';
- pad · function · L11-L11 — pad = (n: number)
- hourKey · function · L12-L12 — hourKey = (t: number)
- dayKey · function · L13-L13 — dayKey = (t: number)
- StatEvent · interface · L17-L22 — interface StatEvent
- recordStats · function · L25-L52 — async function recordStats(e: StatEvent, at = Date.now()): Promise<void>
- Series · interface · L54-L64 — interface Series
- Range · interface · L66-L66 — interface Range
- bucketsFor · function · L70-L78 — function bucketsFor(range: Range['id'], seasonStart: number, now = Date.now()): { starts: number[]; step: 'hour' | 'day' }
- getSeries · function · L81-L104 — async function getSeries(coll: string, starts: number[], step: 'hour' | 'day'): Promise<Series>
- empty · function · L82-L82 — empty = ()
- sum · function · L106-L106 — sum = (xs: number[])
- getPackPulls · function · L109-L123 — async function getPackPulls(collections: string[]): Promise<Record<string, number>>
- getLastSeen · function · L126-L131 — async function getLastSeen(): Promise<Record<string, number>>
