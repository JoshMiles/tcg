# lib/home-data.ts

- StandingRow · interface · L3-L3 — interface StandingRow
- Standing · interface · L5-L14 — interface Standing
- viewerStanding · function · L17-L31 — function viewerStanding(rows: StandingRow[], username: string, totalCards: number): Standing | null
- seasonCountdown · function · L34-L42 — function seasonCountdown(endsAt: number | undefined, now = Date.now()): string | null
- PullItem · interface · L46-L66 — interface PullItem
- notableReason · function · L69-L75 — function notableReason(p: { variant?: string; stars: number; serial?: number }): string | null
- agoShort · function · L78-L85 — function agoShort(at: number, now = Date.now()): string
