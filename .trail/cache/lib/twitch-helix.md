# lib/twitch-helix.ts

- twitchCredentials · function · L11-L15 — function twitchCredentials(): { clientId: string; clientSecret: string } | null
- getAppAccessToken · function · L17-L36 — async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string>
- resolveTwitchLogin · function · L43-L53 — async function resolveTwitchLogin(numericUserId: string): Promise<string | null>
- fetchTwitchAvatars · function · L60-L75 — async function fetchTwitchAvatars(logins: string[]): Promise<Record<string, string>>
