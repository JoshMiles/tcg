// Staff badges on public pages (Streamer / Admin / Mod). Pure helper plus the cached server read.
// Never used by the Twitch panel (freeze).
import { cache } from 'react';
import { staffBadgeFor, type StaffBadge } from './staff-badge-core';
import { listStaff, listSuperAdmins } from './staff';
import { getUserSettings } from './user-settings-store';

export { staffBadgeFor, STAFF_BADGE_LABELS, type StaffBadge } from './staff-badge-core';

/** Every visible badge on the site, login -> badge. Read live from the staff list, once per request. */
export const getStaffBadges = cache(async (): Promise<Record<string, StaffBadge>> => {
  try {
    const staff = await listStaff();
    const supers = listSuperAdmins().map(s => s.login).filter(l => !l.startsWith('Twitch ID'));
    const logins = [...new Set([...staff.map(r => r.login), ...supers.map(s => s.toLowerCase())])];
    const out: Record<string, StaffBadge> = {};
    await Promise.all(logins.map(async l => {
      const badge = staffBadgeFor(l, staff, await getUserSettings(l).catch(() => null), supers);
      if (badge) out[l] = badge;
    }));
    return out;
  } catch { return {}; }
});
