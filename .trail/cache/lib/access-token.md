# lib/access-token.ts

- AccessToken · interface · L12-L12 — interface AccessToken
- b64url · function · L15-L15 — b64url = (bytes: Uint8Array)
- fromB64url · function · L16-L16 — fromB64url = (s: string)
- secret · function · L18-L21 — function secret(env: Record<string, string | undefined> = process.env): string | null
- hmac · function · L24-L27 — async function hmac(payload: string, key: string): Promise<Uint8Array>
- same · function · L29-L29 — same = (a: Uint8Array, b: Uint8Array)
- signAccessToken · function · L31-L37 — async function signAccessToken(data: { login: string; tier: AccessTier; v: number }, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null>
- verifyAccessToken · function · L40-L54 — async function verifyAccessToken(raw: string | undefined, now = Date.now(), env?: Record<string, string | undefined>): Promise<AccessToken | null>
- accessCookieOptions · function · L56-L58 — function accessCookieOptions(maxAge = ACCESS_TTL_S)
