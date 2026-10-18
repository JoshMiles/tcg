# lib/achievements.ts

- AchCard · interface · L10-L10 — interface AchCard
- AchSeason · interface · L12-L22 — interface AchSeason
- Achievement · interface · L24-L35 — interface Achievement
- owns · function · L37-L41 — owns = (s: AchSeason, number: number, v?: Variant): boolean
- goal · function · L43-L47 — function goal(s: AchSeason, kind: string, title: string, detail: string, icon: IconName, cards: AchCard[], has: (c: AchCard) => boolean): Achievement | null
- evaluateSeason · function · L50-L71 — function evaluateSeason(s: AchSeason): Achievement[]
- serialGoals · function · L74-L95 — function serialGoals(s: AchSeason): Achievement[]
- mk · function · L77-L78 — mk = (kind: string, title: string, detail: string, icon: IconName, have: number, need: number): Achievement
- sortAchievements · function · L98-L103 — function sortAchievements<T extends { earned: boolean; have: number; need: number; earnedAt?: number }>(list: T[]): T[]
