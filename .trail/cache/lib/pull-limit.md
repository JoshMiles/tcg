# lib/pull-limit.ts

- key · function · L5-L5 — key = (u: string)
- getUserPullLimit · function · L7-L9 — async function getUserPullLimit(username: string): Promise<UserPullLimit>
- save · function · L11-L14 — async function save(username: string, rec: UserPullLimit): Promise<UserPullLimit>
- setUserBaseLimit · function · L17-L19 — async function setUserBaseLimit(username: string, value: unknown): Promise<UserPullLimit>
- addUserPullBuff · function · L22-L25 — async function addUserPullBuff(username: string, o: { amount: unknown; hours?: unknown; source?: string; note?: string }): Promise<UserPullLimit | null>
- removeUserPullBuff · function · L27-L29 — async function removeUserPullBuff(username: string, id: string): Promise<UserPullLimit>
- deleteUserPullLimit · function · L31-L33 — async function deleteUserPullLimit(username: string): Promise<void>
