# lib/twitch-jwt.ts

- TwitchJwtPayload · interface · L4-L14 — interface TwitchJwtPayload
- verifyTwitchJwt · function · L17-L43 — function verifyTwitchJwt(token: string): TwitchJwtPayload | null
- mockKey · function · L49-L52 — mockKey = (): string | null
- mockSig · function · L53-L53 — mockSig = (key: string, data: string)
- signMockTwitchJwt · function · L55-L61 — function signMockTwitchJwt(claims: Omit<TwitchJwtPayload, 'exp' | 'mock'> & { sandbox: string }, ttlSeconds = 4 * 3600): string | null
- verifyMockJwt · function · L63-L76 — function verifyMockJwt(token: string): TwitchJwtPayload | null
- verifyExtensionAuth · function · L82-L88 — async function verifyExtensionAuth(token: string): Promise<TwitchJwtPayload | null>
- getBearerToken · function · L91-L94 — function getBearerToken(req: Request): string | null
- getTwitchUserId · function · L103-L107 — function getTwitchUserId(payload: TwitchJwtPayload): string | undefined
