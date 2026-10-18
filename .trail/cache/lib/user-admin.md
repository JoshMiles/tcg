# lib/user-admin.ts

- cleanTag · function · L17-L19 — function cleanTag(input: string): string
- cleanTags · function · L20-L22 — function cleanTags(list: string[]): string[]
- UserFlags · interface · L24-L34 — interface UserFlags
- getHiddenUsers · function · L39-L43 — async function getHiddenUsers(): Promise<Set<string>>
- getAdminHidden · function · L46-L48 — async function getAdminHidden(): Promise<Set<string>>
- setHidden · function · L50-L54 — async function setHidden(username: string, hidden: boolean): Promise<void>
- ensureProfile · function · L56-L58 — async function ensureProfile(username: string): Promise<UserProfile>
- saveTags · function · L60-L67 — async function saveTags(username: string, tags: string[]): Promise<string[]>
- saveFlags · function · L69-L78 — async function saveFlags(username: string, flags: UserFlags): Promise<void>
- isTradeBlocked · function · L81-L83 — async function isTradeBlocked(username: string): Promise<boolean>
- UserSnapshot · interface · L87-L93 — interface UserSnapshot
- snapIndex · function · L97-L97 — snapIndex = (u: string)
- snapKey · function · L98-L98 — snapKey = (u: string, id: string)
- takeUserSnapshot · function · L101-L115 — async function takeUserSnapshot(username: string, reason: string): Promise<UserSnapshot | null>
- listUserSnapshots · function · L117-L126 — async function listUserSnapshots(username: string): Promise<UserSnapshot[]>
- restoreUserSnapshot · function · L129-L147 — async function restoreUserSnapshot(username: string, id: string): Promise<{ ok: true; cards: number } | { ok: false; error: string }>
- mergeUsers · function · L155-L184 — async function mergeUsers(fromRaw: string, intoRaw: string): Promise<{ ok: true; cards: number } | { ok: false; error: string }>
