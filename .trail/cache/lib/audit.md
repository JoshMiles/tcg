# lib/audit.ts

- AuditEntry · interface · L9-L16 — interface AuditEntry
- recordAudit · function · L21-L31 — async function recordAudit(username: string, action: string, detail?: string): Promise<void>
- getUserAudit · function · L33-L39 — async function getUserAudit(username: string, limit = 50): Promise<AuditEntry[]>
