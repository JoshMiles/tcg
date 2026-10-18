# lib/access.ts

- AccessResult · interface · L27-L27 — interface AccessResult
- AccessLogEntry · interface · L28-L28 — interface AccessLogEntry
- getAccessSettings · function · L31-L33 — async function getAccessSettings(): Promise<AccessSettings>
- logChange · function · L35-L37 — async function logChange(by: string, what: string)
- getAccessLog · function · L38-L40 — async function getAccessLog(limit = 20): Promise<AccessLogEntry[]>
- saveAccessSettings · function · L43-L56 — async function saveAccessSettings(by: string, input: { mode: AccessMode; label: AccessLabel; message?: string }): Promise<AccessResult>
- getTester · function · L59-L63 — async function getTester(login: string): Promise<TesterRecord | null>
- listTesters · function · L65-L71 — async function listTesters(): Promise<TesterRecord[]>
- awardTesterAchievement · function · L74-L84 — async function awardTesterAchievement(login: string, tier: TesterTier): Promise<void>
- setTester · function · L87-L101 — async function setTester(by: string, loginInput: unknown, tier: unknown, noteInput?: unknown): Promise<AccessResult>
- removeTester · function · L103-L112 — async function removeTester(by: string, loginInput: unknown): Promise<AccessResult>
- deleteTesterRecord · function · L115-L117 — async function deleteTesterRecord(login: string): Promise<void>
- tierFor · function · L121-L126 — async function tierFor(session: Pick<Session, 'username' | 'twitchId' | 'sandbox'> | null): Promise<AccessTier | null>
- hasSiteAccess · function · L129-L135 — async function hasSiteAccess(): Promise<boolean>
- requireSiteAccess · function · L141-L151 — async function requireSiteAccess(): Promise<boolean>
- siteClosedResponse · function · L154-L159 — async function siteClosedResponse(): Promise<NextResponse | null>
