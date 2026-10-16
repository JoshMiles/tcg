// Staff badges (pure, client-safe). The server read is in lib/staff-badge.ts.
import { SUPER_ADMINS, type StaffRecord } from './staff-core';
import { CHANNEL_LOGIN } from './site';

export type StaffBadge = 'streamer' | 'admin' | 'mod';
export const STAFF_BADGE_LABELS: Record<StaffBadge, string> = { streamer: 'Streamer', admin: 'Admin', mod: 'Mod' };

/** The badge a login shows, or null: no role, or they switched their badge off in Settings. Streamer = the channel's own account; super admins show Admin. */
export function staffBadgeFor(
  login: string,
  staff: readonly Pick<StaffRecord, 'login' | 'role'>[],
  settings: { hideStaffBadge?: boolean } | null | undefined,
  superLogins: readonly string[] = SUPER_ADMINS.map(s => s.login),
  streamerLogin: string = CHANNEL_LOGIN,
): StaffBadge | null {
  if (settings?.hideStaffBadge) return null;
  const l = login.trim().toLowerCase();
  if (l === streamerLogin.toLowerCase()) return 'streamer';
  if (superLogins.some(s => s.toLowerCase() === l)) return 'admin';
  const rec = staff.find(r => r.login.toLowerCase() === l);
  return rec ? rec.role : null;
}
