import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, isPasswordLoginEnabled, isValidAdminToken } from '@/lib/admin-token';
import { homePath, roleCan, type StaffRole } from '@/lib/staff-core';
import { STAFF_COOKIE, verifyStaffToken } from '@/lib/staff-token';

// The first gate for the admin (/admin) and mod (/mod) panels. It reads only the signed cookies (no database), so it can send
// the wrong person away early and keep the panels out of reach of anyone signed out. The real check is done again, against the
// live staff list, by the panel layouts, every server action and every API route (lib/staff-guard.ts).
//
//   staff cookie valid (or the emergency admin password cookie)  -> pick the panel by role: admins and the super admin may open
//        both, mods only /mod (an admin URL sends them to /mod)
//   no valid staff cookie but a viewer session exists            -> /auth/staff, which checks the staff list and issues the
//        cookie (this is also how the hourly cookie is refreshed)
//   neither                                                      -> /login
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  let role: StaffRole | null = null;
  const staff = await verifyStaffToken(req.cookies.get(STAFF_COOKIE)?.value);
  if (staff) role = staff.role;
  else if (isPasswordLoginEnabled() && isValidAdminToken(req.cookies.get(AUTH_COOKIE)?.value)) role = 'super';

  if (!role) {
    const here = pathname + search;
    const dest = req.cookies.get('tcg_session')?.value
      ? new URL(`/auth/staff?returnTo=${encodeURIComponent(here)}`, req.url)
      : new URL(`/login?returnTo=${encodeURIComponent(here)}`, req.url);
    return NextResponse.redirect(dest);
  }

  if (pathname.startsWith('/admin') && !roleCan(role, 'admin')) return NextResponse.redirect(new URL(homePath(role), req.url));
  if (pathname.startsWith('/mod') && !roleCan(role, 'mod')) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/mod/:path*'] };
