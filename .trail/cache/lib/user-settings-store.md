# lib/user-settings-store.ts

- key · function · L9-L9 — key = (u: string)
- getUserSettings · function · L11-L13 — async function getUserSettings(username: string): Promise<UserSettings>
- getSelfHidden · function · L16-L18 — async function getSelfHidden(): Promise<Set<string>>
- saveUserSettings · function · L20-L29 — async function saveUserSettings(username: string, input: unknown): Promise<UserSettings>
- deleteUserSettings · function · L31-L34 — async function deleteUserSettings(username: string): Promise<void>
