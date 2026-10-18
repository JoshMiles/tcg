# lib/admin-token.ts

- isPasswordLoginEnabled · function · L10-L12 — function isPasswordLoginEnabled(env: Record<string, string | undefined> = process.env): boolean
- sameString · function · L15-L21 — function sameString(a: string, b: string): boolean
- adminCookieValue · function · L24-L30 — async function adminCookieValue(env: Record<string, string | undefined> = process.env): Promise<string | null>
- isValidAdminToken · function · L33-L36 — async function isValidAdminToken(token: string | undefined, env: Record<string, string | undefined> = process.env): Promise<boolean>
