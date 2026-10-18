# lib/recent-pulls-core.ts

- PullFate · type · L6-L6 — type PullFate = 'held' | 'offer' | 'traded' | 'forged' | 'removed';
- pullFate · function · L9-L14 — function pullFate(c: Pick<Copy, 'owner' | 'ev'>, user: string): PullFate
- pickRecentPulls · function · L17-L24 — function pickRecentPulls(candidates: Copy[], user: string, limit = 8): (Copy & { fate: PullFate })[]
