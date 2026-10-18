# lib/watch-core.ts

- OfferedCard · interface · L8-L8 — interface OfferedCard
- matchingAlerts · function · L11-L13 — function matchingAlerts(s: Pick<UserSettings, 'wanted' | 'watches'>, items: OfferedCard[]): OfferedCard[]
- alertCards · function · L16-L18 — function alertCards(s: Pick<UserSettings, 'wanted' | 'watches'>): number[]
- watchLabel · function · L21-L24 — function watchLabel(w: Watch, nameOf: (n: number) => string | undefined): string
- wantedCounts · function · L30-L38 — function wantedCounts(given: Pick<OfferedCard, 'cardNumber'>[], watchersByCard: Record<number, string[]>, exclude: string[] = []): Record<number, number>
