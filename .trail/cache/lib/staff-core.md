# lib/staff-core.ts

- StaffRole · type · L9-L9 — type StaffRole = 'super' | 'admin' | 'mod';
- Capability · type · L11-L11 — type Capability = 'admin' | 'mod' | 'staff:mods' | 'staff:admins';
- AssignableRole · type · L21-L21 — type AssignableRole = (typeof STAFF_ROLES)[number];
- roleCan · function · L28-L28 — roleCan = (role: StaffRole | null | undefined, cap: Capability): boolean
- StaffRecord · interface · L31-L39 — interface StaffRecord
- cleanLogin · function · L42-L46 — function cleanLogin(input: unknown): string | null
- isTwitchId · function · L48-L48 — isTwitchId = (v: unknown): v is string
- superIds · function · L50-L54 — function superIds(env: Record<string, string | undefined> = process.env): Set<string>
- isSuperAdmin · function · L57-L59 — function isSuperAdmin(identity: { twitchId?: string | null }, env?: Record<string, string | undefined>): boolean
- resolveRole · function · L65-L70 — function resolveRole(identity: { login: string; twitchId?: string | null }, record: StaffRecord | null | undefined, env?: Record<string, string | undefined>): StaffRole | null
- canManage · function · L73-L76 — function canManage(actor: StaffRole | null | undefined, target: StaffRole): boolean
- homePath · function · L79-L79 — homePath = (role: StaffRole): string
- staffReturnTo · function · L82-L87 — function staffReturnTo(raw: string | null | undefined, role: StaffRole): string
- sanitizeStaffRecord · function · L90-L104 — function sanitizeStaffRecord(input: unknown): StaffRecord | null
