# lib/twitch-oauth.ts

- credentials · function · L17-L20 — credentials = ()
- authorizeUrl · function · L22-L32 — function authorizeUrl(state: string): string
- TwitchProfile · interface · L34-L39 — interface TwitchProfile
- exchangeCode · function · L42-L59 — async function exchangeCode(code: string): Promise<string>
- fetchProfile · function · L61-L71 — async function fetchProfile(accessToken: string): Promise<TwitchProfile>
- revoke · function · L73-L80 — async function revoke(accessToken: string): Promise<void>
- profileFromCode · function · L83-L90 — async function profileFromCode(code: string): Promise<TwitchProfile>
- safeReturnTo · function · L93-L97 — function safeReturnTo(raw: string | null | undefined, fallback = '/account'): string
