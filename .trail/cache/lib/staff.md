# lib/staff.ts

- StaffActor · interface · L18-L18 — interface StaffActor
- StaffResult · interface · L19-L19 — interface StaffResult
- StaffLogEntry · interface · L23-L23 — interface StaffLogEntry
- getStaffRecord · function · L25-L29 — async function getStaffRecord(login: string): Promise<StaffRecord | null>
- listStaff · function · L32-L38 — async function listStaff(): Promise<StaffRecord[]>
- getStaffLog · function · L40-L42 — async function getStaffLog(limit = 40): Promise<StaffLogEntry[]>
- log · function · L44-L47 — async function log(entry: Omit<StaffLogEntry, 'at'>)
- listSuperAdmins · function · L50-L54 — function listSuperAdmins(): { login: string; twitchId: string }[]
- knownTwitchId · function · L57-L62 — async function knownTwitchId(login: string): Promise<{ id?: string; displayName?: string }>
- addStaff · function · L64-L81 — async function addStaff(actor: StaffActor, loginInput: unknown, role: AssignableRole): Promise<StaffResult>
- setStaffRole · function · L83-L96 — async function setStaffRole(actor: StaffActor, loginInput: unknown, role: AssignableRole): Promise<StaffResult>
- removeStaff · function · L98-L107 — async function removeStaff(actor: StaffActor, loginInput: unknown): Promise<StaffResult>
- touchStaffLogin · function · L110-L117 — async function touchStaffLogin(login: string, twitchId: string, displayName: string): Promise<void>
