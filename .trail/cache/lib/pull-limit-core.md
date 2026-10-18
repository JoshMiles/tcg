# lib/pull-limit-core.ts

- PullBuff · interface · L5-L14 — interface PullBuff
- UserPullLimit · interface · L16-L20 — interface UserPullLimit
- int · function · L27-L30 — int = (v: unknown, min: number, max: number): number | null
- normalizePullLimit · function · L33-L51 — function normalizePullLimit(raw: unknown): UserPullLimit
- isActive · function · L53-L53 — isActive = (b: PullBuff, now: number)
- effectiveLimit · function · L59-L63 — function effectiveLimit(defaultLimit: number, rec: UserPullLimit, now = Date.now()): { limit: number; base: number; bonus: number; custom: boolean }
- withBase · function · L66-L68 — function withBase(rec: UserPullLimit, value: unknown): UserPullLimit
- withBuff · function · L71-L81 — function withBuff(rec: UserPullLimit, o: { id: string; amount: unknown; hours?: unknown; source?: string; note?: string }, now = Date.now()): UserPullLimit | null
- withoutBuff · function · L83-L85 — function withoutBuff(rec: UserPullLimit, id: string): UserPullLimit
- isEmpty · function · L88-L88 — isEmpty = (rec: UserPullLimit)
