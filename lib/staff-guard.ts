import { cache } from 'react';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, isPasswordLoginEnabled, isValidAdminToken } from './admin-token';
import { getStaffRecord } from './staff';
import type { Session } from './session';
import { roleCan, resolveRole, type Capability, type StaffRole } from './staff-core';
import { STAFF_COOKIE, verifyStaffToken } from './staff-token';

// Who is making this request, as staff. The authoritative check (server actions, API routes and the panel layouts call this);
// the middleware only does the coarse, database-free version from the signed cookie.

export interface StaffContext {
  /** Lower-case Twitch login (or "password" for the emergency password login). */
  login: string;
  twitchId?: string;
  displayName: string;
  role: StaffRole;
  via: 'twitch' | 'password';
}

/**
 * The signed-in staff member for this request, or null. A Twitch staff cookie is re-checked against the live staff list on every
 * call (so removing someone, or changing their role, takes effect at once for anything they change). The old admin password
 * cookie still counts as a super admin unless ADMIN_PASSWORD_LOGIN=off.
 */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const jar = await cookies();
  const token = await verifyStaffToken(jar.get(STAFF_COOKIE)?.value);
  if (token) {
    const role = resolveRole({ login: token.u, twitchId: token.id }, await getStaffRecord(token.u));
    if (role) return { login: token.u, twitchId: token.id, displayName: token.dn || token.u, role, via: 'twitch' };
  }
  if (isPasswordLoginEnabled() && isValidAdminToken(jar.get(AUTH_COOKIE)?.value)) {
    return { login: 'password', displayName: 'Admin (password)', role: 'super', via: 'password' };
  }
  return null;
});

/**
 * The panel link for the public site's top bar: where this visitor's staff role takes them, or null for everyone else. A signed-in
 * viewer is looked up in the staff list (so staff see the button without having opened a panel yet; the link then signs them in
 * through /auth/staff), and a password-only admin is recognised from their cookie. The link is only a convenience: the panels
 * check access again themselves.
 */
export const staffPanelLink = cache(async (session: Session | null): Promise<{ href: string; label: string } | null> => {
  let role: StaffRole | null = null;
  if (session && !session.sandbox) role = resolveRole({ login: session.username, twitchId: session.twitchId }, await getStaffRecord(session.username));
  if (!role) role = (await getStaff())?.role ?? null;
  if (!role) return null;
  return roleCan(role, 'admin') ? { href: '/admin', label: 'Admin panel' } : { href: '/mod', label: 'Mod panel' };
});

/** Throws unless the caller is staff with this capability. Returns who they are, for the audit trail. */
export async function requireStaff(cap: Capability = 'mod'): Promise<StaffContext> {
  const s = await getStaff();
  if (!s || !roleCan(s.role, cap)) throw new Error('Not authorised.');
  return s;
}

/** True when the caller is staff with this capability (for API routes that answer 401 instead of throwing). */
export async function hasStaffCapability(cap: Capability): Promise<boolean> {
  const s = await getStaff();
  return !!s && roleCan(s.role, cap);
}
