# lib/stream-recap.ts

- RecapPull · interface · L12-L12 — interface RecapPull
- StreamRecap · interface · L14-L32 — interface StreamRecap
- variantRank · function · L34-L34 — variantRank = (v?: Variant)
- buildStreamRecap · function · L40-L73 — function buildStreamRecap(events: ActivityEvent[], from: number, to: number, opts: { seasonId?: string; logIsFull?: boolean } = {}): StreamRecap
- asPull · function · L51-L54 — asPull = (p: ActivityEvent & { type: 'pull' }): RecapPull
- recapWorthPosting · function · L76-L76 — recapWorthPosting = (r: StreamRecap)
- sampleRecap · function · L79-L85 — function sampleRecap(now = Date.now()): StreamRecap
