# app/components/captcha-client.ts

- CaptchaRequest · interface · L4-L10 — interface CaptchaRequest
- onCaptchaRequest · function · L15-L18 — function onCaptchaRequest(fn: (r: CaptchaRequest) => void): () => void
- requestToken · function · L20-L25 — function requestToken(siteKey: string, retry: boolean): Promise<string | null>
- postJson · function · L28-L33 — async function postJson(url: string, body: Record<string, unknown>): Promise<Response>
- postJsonOnce · function · L35-L47 — async function postJsonOnce(url: string, body: Record<string, unknown>): Promise<Response>
- send · function · L36-L36 — send = (extra?: Record<string, unknown>)
