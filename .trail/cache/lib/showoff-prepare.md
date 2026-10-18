# lib/showoff-prepare.ts

- ShowPlan · interface · L12-L23 — interface ShowPlan
- ShowResult · type · L25-L25 — type ShowResult = { ok: true; plan: ShowPlan } | { ok: false; error: string; message: string; retryAfter?: number };
- prepareShowOff · function · L32-L81 — async function prepareShowOff(username: string, text: unknown, opts: { dry?: boolean } = {}): Promise<ShowResult>
- best · function · L44-L54 — best = (): ShowCard | null
