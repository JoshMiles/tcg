// Who may use the admin and mod panels (pure, edge-safe: no node or framework imports, because the middleware uses it).
//
// Three roles:
//   super  the owner. Hard-coded below by Twitch ID, can never be removed or demoted, manages everyone.
//   admin  the full admin panel; can add and remove mods.
//   mod    the mod panel only (live activity, moderating viewers, moderating trades).
// Staff are Twitch accounts: they sign in with "Log in with Twitch" and their role is looked up from the staff list.

export type StaffRole = 'super' | 'admin' | 'mod';
/** What a role may do: 'admin' = the admin panel, 'mod' = the mod panel, 'staff:mods' / 'staff:admins' = add and remove those roles. */
export type Capability = 'admin' | 'mod' | 'staff:mods' | 'staff:admins';

/**
 * The super admin. Matched by Twitch's numeric account ID, never by name alone: a Twitch login can be renamed and later
 * claimed by someone else, but the ID can't. More IDs can be added with the SUPER_ADMIN_TWITCH_IDS env var (comma separated).
 */
export const SUPER_ADMINS: { login: string; twitchId: string }[] = [{ login: 'joshmiles', twitchId: '36094918' }];

export const ROLE_LABELS: Record<StaffRole, string> = { super: 'Super admin', admin: 'Admin', mod: 'Mod' };
export const STAFF_ROLES = ['admin', 'mod'] as const;
export type AssignableRole = (typeof STAFF_ROLES)[number];

const CAPABILITIES: Record<StaffRole, readonly Capability[]> = {
  super: ['admin', 'mod', 'staff:mods', 'staff:admins'],
  admin: ['admin', 'mod', 'staff:mods'],
  mod: ['mod'],
};
export const roleCan = (role: StaffRole | null | undefined, cap: Capability): boolean => !!role && CAPABILITIES[role].includes(cap);

/** A staff member as stored. `twitchId` is filled in the first time they sign in (or from their viewer profile when they are added). */
export interface StaffRecord {
  login: string;
  twitchId?: string;
  displayName?: string;
  role: AssignableRole;
  addedBy: string;
  addedAt: number;
  lastLogin?: number;
}

/** Twitch logins are 3 to 25 letters, digits and underscores. Returns the lower-case login, or null if it can't be one. */
export function cleanLogin(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{3,25}$/.test(s) ? s : null;
}

export const isTwitchId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v);

function superIds(env: Record<string, string | undefined> = process.env): Set<string> {
  const ids = new Set(SUPER_ADMINS.map(s => s.twitchId));
  for (const id of (env.SUPER_ADMIN_TWITCH_IDS ?? '').split(',')) if (isTwitchId(id.trim())) ids.add(id.trim());
  return ids;
}

/** Is this Twitch account the super admin? The login is ignored on purpose: only the numeric ID counts. */
export function isSuperAdmin(identity: { twitchId?: string | null }, env?: Record<string, string | undefined>): boolean {
  return !!identity.twitchId && superIds(env).has(identity.twitchId);
}

/**
 * The role a signed-in Twitch account has right now, from the staff list. The super admin comes from the code, not the list.
 * A record bound to a Twitch ID only matches that ID, so a renamed or re-claimed login can't inherit someone's access.
 */
export function resolveRole(identity: { login: string; twitchId?: string | null }, record: StaffRecord | null | undefined, env?: Record<string, string | undefined>): StaffRole | null {
  if (isSuperAdmin(identity, env)) return 'super';
  if (!record || record.login !== identity.login.toLowerCase()) return null;
  if (record.twitchId && record.twitchId !== identity.twitchId) return null;
  return record.role;
}

/** May `actor` add, change or remove someone whose role is `target`? Admins manage mods; only the super admin manages admins. The super admin is untouchable. */
export function canManage(actor: StaffRole | null | undefined, target: StaffRole): boolean {
  if (target === 'super') return false;
  return roleCan(actor, target === 'admin' ? 'staff:admins' : 'staff:mods');
}

/** Where a role lands after signing in. */
export const homePath = (role: StaffRole): string => (roleCan(role, 'admin') ? '/admin' : '/mod');

/** A post-login destination, only if it is inside a panel this role may open. */
export function staffReturnTo(raw: string | null | undefined, role: StaffRole): string {
  const ok = !!raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') && !/[\r\n]/.test(raw);
  if (ok && raw!.startsWith('/admin') && roleCan(role, 'admin')) return raw!;
  if (ok && raw!.startsWith('/mod') && roleCan(role, 'mod')) return raw!;
  return homePath(role);
}

/** Cleans a stored record read back from KV (drops anything unexpected). */
export function sanitizeStaffRecord(input: unknown): StaffRecord | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const login = cleanLogin(o.login);
  if (!login || (o.role !== 'admin' && o.role !== 'mod')) return null;
  return {
    login,
    ...(isTwitchId(o.twitchId) ? { twitchId: o.twitchId } : {}),
    ...(typeof o.displayName === 'string' && o.displayName ? { displayName: o.displayName.slice(0, 40) } : {}),
    role: o.role,
    addedBy: typeof o.addedBy === 'string' ? o.addedBy.slice(0, 40) : 'unknown',
    addedAt: typeof o.addedAt === 'number' ? o.addedAt : 0,
    ...(typeof o.lastLogin === 'number' ? { lastLogin: o.lastLogin } : {}),
  };
}
