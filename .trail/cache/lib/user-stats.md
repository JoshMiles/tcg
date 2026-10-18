# lib/user-stats.ts

- UpgradeOption · interface · L8-L16 — interface UpgradeOption
- UserStats · interface · L18-L45 — interface UserStats
- computeUserStats · function · L48-L131 — function computeUserStats( o: SeasonOverview, username: string, owned: number[], /** Everyone's entries for the season; needed to project upgrade gains. */ collection: Record<string, number[]>, /** `upgrades: false` skips working out what they could upgrade (the costly part), for public views that never show it. */ opts: { upgrades?: boolean } = {}, ): UserStats
- valueOf · function · L65-L65 — valueOf = (c: SeasonCard, v: Variant)
