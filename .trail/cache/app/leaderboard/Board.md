# app/leaderboard/Board.tsx

- Moves · type · L16-L16 — type Moves = Record<string, number>;
- Board · function · L23-L132 — function Board({ rows, avatars, totalCards, seasonId, viewer, badges = {}, noVariants = false }: { rows: BoardRow[]; avatars: Record<string, string | undefined>; totalCards: number; seasonId: string; viewer?: string; /** Staff badges by login. */ badges?: Record<string, StaffBadgeKind>; /** Rows without per-version counts (an old final standing): no Shinies ranking. */ noVariants?: boolean })
- jumpToMe · function · L49-L55 — jumpToMe = ()
