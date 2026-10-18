# lib/board-view.ts

- BoardMetric · type · L3-L3 — type BoardMetric = 'points' | 'cards' | 'copies' | 'shiny';
- BoardRow · interface · L7-L20 — interface BoardRow
- standingsToBoardRows · function · L23-L40 — function standingsToBoardRows( standings: { username: string; score: number; cardPoints: number; uniqueCards: number; copies: number; complete: boolean; completionBonus?: number; setBonus?: number; variants?: BoardRow['variants'] }[], hidden: ReadonlySet<string> = new Set(), ): { rows: BoardRow[]; hasVariants: boolean }
- metricValue · function · L42-L43 — metricValue = (r: BoardRow, m: BoardMetric): number
- RankedRow · interface · L45-L45 — interface RankedRow
- rankBoard · function · L48-L56 — function rankBoard(rows: BoardRow[], metric: BoardMetric): RankedRow[]
- filterBoard · function · L59-L62 — function filterBoard(ranked: RankedRow[], opts: { q?: string; completeOnly?: boolean }): RankedRow[]
- rankMovement · function · L65-L72 — function rankMovement(before: Record<string, number>, now: RankedRow[]): Record<string, number>
- rankSnapshot · function · L74-L74 — rankSnapshot = (ranked: RankedRow[]): Record<string, number>
