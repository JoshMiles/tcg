# lib/staff-token.ts

- StaffToken · interface · L18-L18 — interface StaffToken
- b64url · function · L21-L21 — b64url = (bytes: Uint8Array)
- fromB64url · function · L22-L22 — fromB64url = (s: string)
- secret · function · L24-L27 — function secret(env: Record<string, string | undefined> = process.env): string | null
- hmac · function · L29-L32 — async function hmac(payload: string, key: string): Promise<Uint8Array>
- same · function · L34-L34 — same = (a: Uint8Array, b: Uint8Array)
- signStaffToken · function · L36-L43 — async function signStaffToken(data: Omit<StaffToken, 'exp' | 'iat'> & { iat?: number }, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null>
- verifyStaffToken · function · L46-L60 — async function verifyStaffToken(raw: string | undefined, now = Date.now(), env?: Record<string, string | undefined>): Promise<StaffToken | null>
- shouldRenewStaffToken · function · L63-L67 — function shouldRenewStaffToken(t: StaffToken, now = Date.now()): boolean
- renewStaffToken · function · L70-L73 — async function renewStaffToken(t: StaffToken, role: StaffRole, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null>
- staffCookieOptions · function · L75-L77 — function staffCookieOptions(maxAge = STAFF_TTL_S)
