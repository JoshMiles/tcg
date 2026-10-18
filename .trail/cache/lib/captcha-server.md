# lib/captcha-server.ts

- passKey · function · L5-L5 — passKey = (username: string)
- clientIp · function · L7-L10 — function clientIp(req: Request): string | undefined
- captchaGate · function · L16-L25 — async function captchaGate(req: Request, username: string, body: Record<string, unknown>): Promise<NextResponse | null>
