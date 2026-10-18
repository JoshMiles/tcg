# lib/data-health.ts

- HealthLevel · type · L15-L15 — type HealthLevel = 'ok' | 'warn' | 'high';
- healthLevel · function · L17-L17 — healthLevel = (bytes: number): HealthLevel
- jsonBytes · function · L20-L20 — jsonBytes = (value: unknown): number
- formatBytes · function · L22-L26 — function formatBytes(bytes: number): string
- CollectionSummary · interface · L28-L34 — interface CollectionSummary
- summarizeCollection · function · L37-L47 — function summarizeCollection(collection: Record<string, number[]>): CollectionSummary
- sizeAttention · function · L50-L57 — function sizeAttention(seasonName: string, bytes: number): { level: HealthLevel; text: string } | null
- LedgerHealth · interface · L61-L74 — interface LedgerHealth
- SeasonHealth · interface · L76-L83 — interface SeasonHealth
- TradesHealth · interface · L85-L85 — interface TradesHealth
- DataHealth · interface · L87-L92 — interface DataHealth
- ledgerHealth · function · L97-L116 — async function ledgerHealth(collectionName: string, viewers: string[]): Promise<LedgerHealth>
- loadDataHealth · function · L119-L135 — async function loadDataHealth(activeSeasonId?: string | null): Promise<DataHealth>
