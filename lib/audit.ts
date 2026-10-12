import { kv } from './db';

// A small audit trail of what an admin did to a viewer's account (grants, removals, resets, edits, restores, merges, flags). It is
// best-effort (never throws), capped, and shown on the user's page. `audit:user:<name>` holds that viewer's newest entries and
// `audit:all` the newest across everyone.

export interface AuditEntry {
  at: number;
  username: string;
  action: string;
  detail?: string;
}

const USER_CAP = 100;
const ALL_CAP = 500;

export async function recordAudit(username: string, action: string, detail?: string): Promise<void> {
  try {
    const entry: AuditEntry = { at: Date.now(), username: username.toLowerCase(), action, ...(detail ? { detail: detail.slice(0, 300) } : {}) };
    await kv.lpush(`audit:user:${entry.username}`, entry);
    await kv.ltrim(`audit:user:${entry.username}`, 0, USER_CAP - 1);
    await kv.lpush('audit:all', entry);
    await kv.ltrim('audit:all', 0, ALL_CAP - 1);
  } catch { /* best effort */ }
}

export async function getUserAudit(username: string, limit = 50): Promise<AuditEntry[]> {
  try {
    return (await kv.lrange<AuditEntry>(`audit:user:${username.toLowerCase()}`, 0, limit - 1)) ?? [];
  } catch {
    return [];
  }
}
