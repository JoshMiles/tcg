# lib/mixitup-core.ts

- MixItUpSettings · interface · L5-L22 — interface MixItUpSettings
- num · function · L32-L35 — num = (v: unknown, fallback: number, min: number, max: number): number
- text · function · L36-L36 — text = (v: unknown, max: number, fallback = ''): string
- normalizeMixItUp · function · L39-L53 — function normalizeMixItUp(raw: unknown): MixItUpSettings
- cleanMixItUpInput · function · L56-L68 — function cleanMixItUpInput(raw: Record<string, unknown>): { ok: true; settings: MixItUpSettings } | { ok: false; message: string }
- renderMessage · function · L71-L74 — function renderMessage(template: string, vars: Record<string, string | number | undefined>): string
- parseBalance · function · L80-L85 — function parseBalance(body: unknown, field: string): number | null
- replyApplied · function · L88-L95 — function replyApplied(status: number, body: unknown): boolean
- streamKey · function · L98-L100 — function streamKey(startedAtMs: number | null, now = Date.now()): string
- RefusalReason · type · L102-L102 — type RefusalReason = 'insufficient_balance' | 'limit_reached' | 'mixitup_unavailable' | 'bad_balance';
- refusalMessage · function · L105-L112 — function refusalMessage(reason: RefusalReason, s: Pick<MixItUpSettings, 'cost' | 'currency' | 'limit'>, username: string, balance?: number): string
- decide · function · L115-L117 — function decide(o: { balance: number; cost: number; pending: number }): boolean
