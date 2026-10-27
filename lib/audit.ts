import { kv } from './db';
import { currentStaffLogin } from './staff-actor';
import { notifyAdminLog } from './discord';
import { SECOND_APPROVAL_NOTE } from './trade-core';

// A small audit trail of what an admin did to a viewer's account (grants, removals, resets, edits, restores, merges, flags). It is
// best-effort (never throws), capped, and shown on the user's page. `audit:user:<name>` holds that viewer's newest entries and
// `audit:all` the newest across everyone.

export interface AuditEntry {
  at: number;
  username: string;
  action: string;
  detail?: string;
  /** Who did it: the staff member's Twitch login (or "password" for the emergency login). Absent on older entries. */
  by?: string;
}

const USER_CAP = 100;
const ALL_CAP = 500;

export async function recordAudit(username: string, action: string, detail?: string): Promise<void> {
  try {
    const by = await currentStaffLogin();
    const entry: AuditEntry = { at: Date.now(), username: username.toLowerCase(), action, ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(by ? { by } : {}) };
    await kv.lpush(`audit:user:${entry.username}`, entry);
    await kv.ltrim(`audit:user:${entry.username}`, 0, USER_CAP - 1);
    await kv.lpush('audit:all', entry);
    await kv.ltrim('audit:all', 0, ALL_CAP - 1);
    void notifyAdminLog({ action, subject: entry.username, detail: entry.detail, by });
  } catch { /* best effort */ }
}

const DAY = 24 * 60 * 60 * 1000;

/** Pure: audit entries per staff login within the last `days` days (entries without `by` are skipped). */
export function countByStaff(entries: AuditEntry[], now: number, days = 7): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) if (e.by && e.at >= now - days * DAY) out[e.by] = (out[e.by] ?? 0) + 1;
  return out;
}

/** Actions per staff login over the last 7 days, from `audit:all` (one `lrange`). Capped at the newest ALL_CAP entries, so a very busy week undercounts. */
export async function getStaffActionCounts(): Promise<Record<string, number>> {
  try { return countByStaff((await kv.lrange<AuditEntry>('audit:all', 0, ALL_CAP - 1)) ?? [], Date.now()); } catch { return {}; }
}

/** Pure (TRIAL, ROADMAP 51.7): distinct big trade reversals logged within the last days days. Both people get an entry, so count distinct trade ids (the detail starts with the id). */
export function countBigReversals(entries: AuditEntry[], now: number, days = 14): number {
  const ids = new Set<string>();
  for (const e of entries) if (e.action === 'Trade reversed' && e.at >= now - days * DAY && e.detail?.includes(SECOND_APPROVAL_NOTE)) ids.add(e.detail.slice(0, 8));
  return ids.size;
}

export async function getBigReversalCount(): Promise<number> {
  try { return countBigReversals((await kv.lrange<AuditEntry>('audit:all', 0, ALL_CAP - 1)) ?? [], Date.now()); } catch { return 0; }
}

export async function getUserAudit(username: string, limit = 50): Promise<AuditEntry[]> {
  try {
    return (await kv.lrange<AuditEntry>(`audit:user:${username.toLowerCase()}`, 0, limit - 1)) ?? [];
  } catch {
    return [];
  }
}
