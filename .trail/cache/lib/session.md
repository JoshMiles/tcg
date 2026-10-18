# lib/session.ts

- Session · interface · L14-L22 — interface Session
- secret · function · L24-L27 — function secret(): string | null
- loginConfigured · function · L30-L32 — function loginConfigured(): boolean
- sign · function · L34-L34 — sign = (payload: string, key: string)
- signSession · function · L36-L42 — function signSession(data: Omit<Session, 'exp'>): string | null
- verifySession · function · L44-L61 — function verifySession(token: string | undefined): Session | null
- getSession · function · L64-L69 — async function getSession(): Promise<Session | null>
- sessionCookieOptions · function · L71-L79 — function sessionCookieOptions(maxAge = MAX_AGE_S)
- isSameOrigin · function · L85-L94 — function isSameOrigin(req: Request): boolean
