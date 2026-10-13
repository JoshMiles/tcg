import { requireStaff, type StaffContext } from './staff-guard';

/**
 * Throws unless the caller is an admin (or the super admin, or signed in with the emergency password). Server actions are public
 * POST endpoints: Next.js lets one be invoked by id from outside its page, so anything powerful checks this itself.
 * Returns who the caller is. Actions mods may also use call `requireStaff('mod')` instead.
 */
export async function requireAdmin(): Promise<StaffContext> {
  return requireStaff('admin');
}
