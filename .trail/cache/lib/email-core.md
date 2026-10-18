# lib/email-core.ts

- EmailKind · type · L9-L9 — type EmailKind = PushKind;
- EmailOff · type · L20-L20 — type EmailOff = 'unsubscribed' | 'bounced' | 'complained';
- EmailRecord · interface · L21-L21 — interface EmailRecord
- EmailStatus · type · L22-L22 — type EmailStatus = 'pending' | 'on' | 'off';
- emailStatus · function · L24-L24 — emailStatus = (r: EmailRecord): EmailStatus
- normalizeAddress · function · L27-L32 — function normalizeAddress(v: unknown): string | null
- maskAddress · function · L35-L38 — function maskAddress(a: string): string
- sanitizeEmailKinds · function · L40-L42 — function sanitizeEmailKinds(v: unknown): EmailKind[]
- sanitizeEmailRecord · function · L44-L53 — function sanitizeEmailRecord(raw: unknown): EmailRecord | null
- emailWants · function · L56-L56 — emailWants = (r: EmailRecord | null, kind: string): boolean
- esc · function · L65-L65 — esc = (s: string)
- BuiltEmail · interface · L67-L67 — interface BuiltEmail
- buildEmail · function · L70-L96 — function buildEmail(items: Notice[], links: { base: string; unsubscribe: string; manage: string }, appName: string): BuiltEmail
- url · function · L78-L78 — url = (n: Notice)
- buildConfirmEmail · function · L98-L109 — function buildConfirmEmail(confirmUrl: string, appName: string, ttlHours: number): BuiltEmail
