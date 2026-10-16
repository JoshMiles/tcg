// Staff badges (pure, client-safe). The server read is in lib/staff-badge.ts.
import { SUPER_ADMINS, type StaffRecord } from './staff-core';

export type StaffBadge = 'streamer' | 'admin' | 'mod';
export const STAFF_BADGE_LABELS: Record<StaffBadge, string> = { streamer: 'Streamer', admin: 'Admin', mod: 'Mod' };

/** The badge a login shows, or null: no staff role, or they switched their badge off in Settings. */
export function staffBadgeFor(
  login: string,
  staff: readonly Pick<StaffRecord, 'login' | 'role'>[],
  settings: { hideStaffBadge?: boolean } | null | undefined,
  superLogins: readonly string[] = SUPER_ADMINS.map(s => s.login),
): StaffBadge | null {
  if (settings?.hideStaffBadge) return null;
  const l = login.trim().toLowerCase();
  if (superLogins.some(s => s.toLowerCase() === l)) return 'streamer';
  const rec = staff.find(r => r.login.toLowerCase() === l);
  return rec ? rec.role : null;
}
