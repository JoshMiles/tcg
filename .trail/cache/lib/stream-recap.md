# lib/stream-recap.ts

- RecapPull · interface · L12-L12 — interface RecapPull
- RecapActions · interface · L15-L15 — interface RecapActions
- StreamRecap · interface · L17-L41 — interface StreamRecap
- noActions · function · L43-L43 — noActions = (): RecapActions
- variantRank · function · L46-L46 — variantRank = (v?: Variant)
- buildStreamRecap · function · L52-L93 — function buildStreamRecap(events: ActivityEvent[], from: number, to: number, opts: { seasonId?: string; logIsFull?: boolean } = {}): StreamRecap
- asPull · function · L63-L66 — asPull = (p: ActivityEvent & { type: 'pull' }): RecapPull
- recapWorthPosting · function · L96-L96 — recapWorthPosting = (r: StreamRecap)
- normalizeRecap · function · L99-L100 — normalizeRecap = (r: Partial<StreamRecap> & Omit<StreamRecap, 'rewards' | 'staffGrants' | 'upgrades' | 'actions'>): StreamRecap
- sampleRecap · function · L103-L110 — function sampleRecap(now = Date.now()): StreamRecap
