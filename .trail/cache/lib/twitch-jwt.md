# lib/twitch-jwt.ts

- TwitchJwtPayload · interface · L4-L14 — interface TwitchJwtPayload
- verifyTwitchJwt · function · L17-L44 — function verifyTwitchJwt(token: string): TwitchJwtPayload | null
- mockKey · function · L50-L53 — mockKey = (): string | null
- mockSig · function · L54-L54 — mockSig = (key: string, data: string)
- signMockTwitchJwt · function · L56-L62 — function signMockTwitchJwt(claims: Omit<TwitchJwtPayload, 'exp' | 'mock'> & { sandbox: string }, ttlSeconds = 4 * 3600): string | null
- verifyMockJwt · function · L64-L77 — function verifyMockJwt(token: string): TwitchJwtPayload | null
- verifyExtensionAuth · function · L83-L89 — async function verifyExtensionAuth(token: string): Promise<TwitchJwtPayload | null>
- getBearerToken · function · L92-L95 — function getBearerToken(req: Request): string | null
- getTwitchUserId · function · L104-L108 — function getTwitchUserId(payload: TwitchJwtPayload): string | undefined
