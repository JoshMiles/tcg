import { NextRequest, NextResponse } from 'next/server';
import { readAdminGenEdge } from '@/lib/admin-auth-edge';
import { AUTH_COOKIE, adminCookieKey, isPasswordLoginEnabled, isValidAdminToken } from '@/lib/admin-token';
import { homePath, roleCan, type StaffRole } from '@/lib/staff-core';
import { STAFF_COOKIE, verifyStaffToken } from '@/lib/staff-token';
import { ACCESS_COOKIE, verifyAccessToken } from '@/lib/access-token';
import { gateDecision } from '@/lib/access-gate';
import { readAccessSettings } from '@/lib/access-edge';
import { isExemptPath } from '@/lib/access-core';

// The first gate for the admin (/admin) and mod (/mod) panels (and, for the extension's endpoints, the CORS answers below). The staff
// cookie is checked from the signature alone (no database). The emergency password cookie is also checked here, including its
// server-side expiry and generation (one KV read, and only when that cookie is present). The real check is done again, against the
// live staff list, by the panel layouts, every server action and every API route (lib/staff-guard.ts).
//
//   staff cookie valid (or the emergency admin password cookie)  -> pick the panel by role: admins and the super admin may open
//        both, mods only /mod (an admin URL sends them to /mod)
//   no valid staff cookie but a viewer session exists            -> /auth/staff, which checks the staff list and issues the
//        cookie (this is also how the hourly cookie is refreshed)
//   neither                                                      -> /login
// The hosted Twitch extension is served from Twitch's own domain (https://<client id>.ext-twitch.tv, or the developer rig), so its
// calls to our API are cross-origin. Only the extension's own endpoints answer them, and only for those origins.
const EXTENSION_ORIGIN = /^https:\/\/([a-z0-9]+\.ext-twitch\.tv|localhost\.rig\.twitch\.tv(:\d+)?)$/;
const DEV_ORIGIN = /^http:\/\/localhost:\d+$/;

/** The emergency password cookie, checked for signature, expiry and the current generation. No cookie, or a failed read, is a no. */
async function emergencyAdmin(req: NextRequest): Promise<boolean> {
  if (!isPasswordLoginEnabled()) return false;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const key = adminCookieKey();
  if (!token || !key) return false;
  const gen = await readAdminGenEdge();
  return gen !== null && await isValidAdminToken(token, key, gen);
}

function extensionCors(req: NextRequest): NextResponse {
  const origin = req.headers.get('origin') ?? '';
  const allowed = EXTENSION_ORIGIN.test(origin) || (process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(origin));
  const headers: Record<string, string> = allowed
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : { Vary: 'Origin' };
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

// The closed alpha / beta gate for the public site (ROADMAP Track 16). Coarse and database-free apart from one cached read of the mode
// and, only when the emergency password cookie is present, one read of its generation:
// a signed `tcg_access` cookie says the visitor is a tester or staff. /auth/access issues it; the layouts and signed-in APIs re-check the
// live lists (lib/access.ts). Mode Open passes everything, and so does a failed read of the mode. The extension's API never meets it.
async function publicGate(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  // The layouts read this to skip their own check on the pages that stay open (FAQ, privacy, terms).
  const headers = new Headers(req.headers);
  headers.set('x-tcg-path', pathname);
  const pass = () => NextResponse.next({ request: { headers } });
  if (isExemptPath(pathname)) return pass();

  let settings = await readAccessSettings();
  if (!settings || settings.mode === 'open') return pass();
  const access = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
  // A cookie issued after our remembered copy means the copy is out of date: look again before judging it.
  if (access && access.v > settings.v) settings = (await readAccessSettings(true)) ?? settings;
  const staffCookie = !!(await verifyStaffToken(req.cookies.get(STAFF_COOKIE)?.value)) || await emergencyAdmin(req);
  const outcome = gateDecision({ pathname, settings, access, staffCookie, hasSession: !!req.cookies.get('tcg_session')?.value });
  if (outcome === 'pass') return pass();
  if (outcome === 'forbidden') return NextResponse.json({ ok: false, error: 'closed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const here = pathname + search;
  const dest = outcome === 'refresh' ? `/auth/access?returnTo=${encodeURIComponent(here)}` : '/closed';
  return NextResponse.redirect(new URL(dest, req.url));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // The extension's endpoints keep exactly their CORS answers (Twitch panel freeze); the public gate never touches them.
  if (pathname === '/api/version' || pathname.startsWith('/api/twitch/')) return extensionCors(req);
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/mod')) return publicGate(req);

  let role: StaffRole | null = null;
  const staff = await verifyStaffToken(req.cookies.get(STAFF_COOKIE)?.value);
  if (staff) role = staff.role;
  else if (await emergencyAdmin(req)) role = 'super';

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

// The staff panels, the extension's endpoints and now the whole public site. Static files (anything with a dot, so also the overlay,
// the service worker and robots.txt) and the build output never reach the middleware. isExemptPath is the explicit allow list.
export const config = { matcher: ['/((?!_next/|assets/|brand/|icons/|twitch-panel/|.*\\..*).*)'] };
