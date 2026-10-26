import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { currentAdminGen } from './admin-cookie';
import { AUTH_COOKIE, adminCookieKey, isPasswordLoginEnabled, isValidAdminToken } from './admin-token';
import { getStaffRecord } from './staff';
import type { Session } from './session';
import { roleCan, resolveRole, type Capability, type StaffRole } from './staff-core';
import { STAFF_COOKIE, renewStaffToken, staffCookieOptions, verifyStaffToken } from './staff-token';

// Who is making this request, as staff. The authoritative check (server actions, API routes and the panel layouts call this).
// The middleware does the coarse version from the signed cookies. For the emergency password cookie both checks also read the
// generation in KV, so a sign-out rejects a copied cookie here at once.

export interface StaffContext {
  /** Lower-case Twitch login (or "password" for the emergency password login). */
  login: string;
  twitchId?: string;
  displayName: string;
  role: StaffRole;
  via: 'twitch' | 'password';
}

/** Signature, expiry and the live generation. A missing key or a failed generation read rejects the cookie. */
async function emergencyCookieValid(token: string): Promise<boolean> {
  const key = adminCookieKey();
  if (!key) return false;
  const gen = await currentAdminGen();
  return gen !== null && await isValidAdminToken(token, key, gen);
}

/**
 * The signed-in staff member for this request, or null. A Twitch staff cookie is re-checked against the live staff list on every
 * call (so removing someone, or changing their role, takes effect at once for anything they change). The emergency password
 * cookie still counts as a super admin unless ADMIN_PASSWORD_LOGIN=off, and only while its signature, expiry and generation hold.
 */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const jar = await cookies();
  await connection(); // the token check reads the clock; a prerender must stop at the cookie read
  const token = await verifyStaffToken(jar.get(STAFF_COOKIE)?.value);
  if (token) {
    const role = resolveRole({ login: token.u, twitchId: token.id }, await getStaffRecord(token.u));
    if (role) return { login: token.u, twitchId: token.id, displayName: token.dn || token.u, role, via: 'twitch' };
  }
  const emergency = jar.get(AUTH_COOKIE)?.value;
  if (isPasswordLoginEnabled() && emergency && await emergencyCookieValid(emergency)) {
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

/**
 * Slide the staff cookie forward: when it has under 30 minutes left (and the session is under 12 hours old), re-issue it with the
 * live role, so an open activity feed keeps working. Only runs for a Twitch staff session that getStaff just re-checked, so a removed
 * member is never renewed. Setting a cookie is only allowed in route handlers and actions; anywhere else (a page render) it is skipped.
 */
async function renewStaffCookie(s: StaffContext): Promise<void> {
  if (s.via !== 'twitch') return;
  try {
    const jar = await cookies();
    const token = await verifyStaffToken(jar.get(STAFF_COOKIE)?.value);
    if (!token) return;
    const fresh = await renewStaffToken(token, s.role);
    if (fresh) jar.set(STAFF_COOKIE, fresh, staffCookieOptions());
  } catch { /* cookies are read-only here; the next action or poll renews it */ }
}

/** Throws unless the caller is staff with this capability. Returns who they are, for the audit trail. */
export async function requireStaff(cap: Capability = 'mod'): Promise<StaffContext> {
  const s = await getStaff();
  if (!s || !roleCan(s.role, cap)) throw new Error('Not authorised.');
  await renewStaffCookie(s);
  return s;
}

/**
 * First line of every /admin and /mod page: re-reads the live staff list and sends anyone without this capability away (a mod to
 * /mod, everyone else to the login page). The layouts check too, but they do not render again on in-panel navigation, so each
 * page checks for itself. scripts/check-staff-guards.mts fails a page without it.
 */
export async function staffPage(cap: Capability): Promise<StaffContext> {
  const s = await getStaff();
  if (!s || !roleCan(s.role, cap)) redirect(s ? '/mod' : '/login?error=not-staff');
  return s;
}

/** True when the caller is staff with this capability (for API routes that answer 401 instead of throwing). */
export async function hasStaffCapability(cap: Capability): Promise<boolean> {
  const s = await getStaff();
  if (!s || !roleCan(s.role, cap)) return false;
  await renewStaffCookie(s);
  return true;
}
