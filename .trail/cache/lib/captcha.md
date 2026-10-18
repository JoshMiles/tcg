# lib/captcha.ts

- CaptchaKeys · interface · L15-L15 — interface CaptchaKeys
- captchaKeys · function · L16-L20 — function captchaKeys(env: Record<string, string | undefined> = process.env): CaptchaKeys | null
- VerifyResult · type · L22-L22 — type VerifyResult = 'valid' | 'invalid' | 'unreachable';
- CaptchaDeps · interface · L24-L30 — interface CaptchaDeps
- CaptchaOutcome · type · L32-L34 — type CaptchaOutcome = | { ok: true; via: 'off' | 'pass' | 'token' | 'unreachable' } | { ok: false; reason: 'required' | 'failed'; siteKey: string };
- checkCaptcha · function · L37-L46 — async function checkCaptcha(input: { username: string; token?: unknown; ip?: string }, deps: CaptchaDeps): Promise<CaptchaOutcome>
- verifyTurnstile · function · L49-L60 — async function verifyTurnstile(token: string, secret: string, ip?: string, fetchImpl: typeof fetch = fetch): Promise<VerifyResult>
- captchaBody · function · L63-L69 — function captchaBody(outcome: Extract<CaptchaOutcome, { ok: false }>)
