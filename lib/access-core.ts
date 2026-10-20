// Closed alpha / beta: who may use the public site while it is locked (pure and edge-safe: the middleware uses it too).
//
// Three modes, set by an admin: Open (today), Beta (alpha and beta testers plus staff) and Alpha (alpha testers plus staff). `label` is
// separate, so a public beta can show the banner without locking anything. The testers list is the KV hash `access:testers`
// (login -> record); the settings are `access:settings`. lib/access.ts has the KV side, lib/access-token.ts the signed cookie.

export type AccessMode = 'open' | 'beta' | 'alpha';
export type AccessLabel = 'none' | 'alpha' | 'beta';
export type TesterTier = 'alpha' | 'beta';
/** What the signed access cookie says the holder is. */
export type AccessTier = TesterTier | 'staff';

export const ACCESS_MODES: AccessMode[] = ['open', 'beta', 'alpha'];
export const ACCESS_LABELS: AccessLabel[] = ['none', 'alpha', 'beta'];
export const MODE_LABELS: Record<AccessMode, string> = { open: 'Open', beta: 'Closed beta', alpha: 'Closed alpha' };
export const MODE_HINTS: Record<AccessMode, string> = {
  open: 'Everyone can use the site.',
  beta: 'Alpha and beta testers, and staff.',
  alpha: 'Alpha testers and staff only.',
};
export const MAX_TESTERS = 500;
export const MESSAGE_MAX = 300;

export interface AccessSettings { mode: AccessMode; label: AccessLabel; message?: string; v: number }
export const DEFAULT_ACCESS: AccessSettings = { mode: 'open', label: 'none', v: 0 };

export interface TesterRecord { login: string; tier: TesterTier; addedBy: string; addedAt: number; note?: string }

function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

export function normalizeAccess(raw: unknown): AccessSettings {
  const o = (typeof raw === 'string' ? safeParse(raw) : raw) as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return { ...DEFAULT_ACCESS };
  const message = typeof o.message === 'string' ? o.message.trim().slice(0, MESSAGE_MAX) : '';
  return {
    mode: ACCESS_MODES.includes(o.mode as AccessMode) ? (o.mode as AccessMode) : 'open',
    label: ACCESS_LABELS.includes(o.label as AccessLabel) ? (o.label as AccessLabel) : 'none',
    ...(message ? { message } : {}),
    v: typeof o.v === 'number' && Number.isFinite(o.v) && o.v >= 0 ? Math.floor(o.v) : 0,
  };
}

export function sanitizeTester(raw: unknown): TesterRecord | null {
  const o = (typeof raw === 'string' ? safeParse(raw) : raw) as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const login = typeof o.login === 'string' ? o.login.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,25}$/.test(login) || (o.tier !== 'alpha' && o.tier !== 'beta')) return null;
  const note = typeof o.note === 'string' ? o.note.trim().slice(0, 120) : '';
  return {
    login, tier: o.tier,
    addedBy: typeof o.addedBy === 'string' ? o.addedBy.slice(0, 40) : '',
    addedAt: typeof o.addedAt === 'number' ? o.addedAt : 0,
    ...(note ? { note } : {}),
  };
}

/** May this visitor in? Staff always; testers when the mode includes their tier; everyone when the site is open. */
export function canEnter(mode: AccessMode, tier: TesterTier | null | undefined, isStaff: boolean): boolean {
  if (mode === 'open' || isStaff) return true;
  if (mode === 'beta') return tier === 'alpha' || tier === 'beta';
  return tier === 'alpha';
}

/** The cookie's tier, split back into the two inputs of canEnter. */
export const canEnterTier = (mode: AccessMode, tier: AccessTier): boolean => canEnter(mode, tier === 'staff' ? null : tier, tier === 'staff');

/** The best tier a person has: staff first, then the tester tier. */
export function bestTier(isStaff: boolean, tester: TesterTier | null | undefined): AccessTier | null {
  return isStaff ? 'staff' : tester ?? null;
}

// ── Which paths the gate leaves alone ──
// Exempt in every mode: the Twitch panel and its API, the OBS overlay and every webhook / cron / overlay / collection API, the login and
// access routes, the staff panels (they have their own gate), the legal pages (not the FAQ: it is for testers too), the closed page itself and static files.
const EXEMPT_PAGES = ['/closed', '/login', '/privacy', '/terms', '/admin', '/mod', '/offline'];
const EXEMPT_PREFIXES = ['/auth/', '/_next/', '/assets/', '/brand/', '/icons/', '/twitch-panel/'];
const EXEMPT_API = ['/api/twitch', '/api/version', '/api/webhooks', '/api/cron', '/api/overlay', '/api/collection', '/api/auth', '/api/admin', '/api/seasons', '/api/sandbox', '/api/upload', '/api/seed', '/api/account/deletion', '/api/account/export'];
/** The public site's own APIs, which need a tester or staff sign-in when the site is closed. Every other API is left alone. */
const GATED_API = ['/api/account', '/api/trades', '/api/notifications', '/api/feedback', '/api/search', '/api/live', '/api/recent-pulls'];

const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** True when the gate never applies to this path. Anything with a file extension counts (static files, the overlay, robots.txt, the service worker). */
export function isExemptPath(pathname: string): boolean {
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  if (EXEMPT_PAGES.some(p => within(pathname, p))) return true;
  if (EXEMPT_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (pathname.startsWith('/api/')) return EXEMPT_API.some(p => within(pathname, p)) || !GATED_API.some(p => within(pathname, p));
  return false;
}

export const isApiPath = (pathname: string) => pathname.startsWith('/api/');

/** The default banner text, replaced by the admin's message when one is set. */
export const DEFAULT_BANNER: Record<'alpha' | 'beta', string> = {
  alpha: 'Alpha: things may change, and progress may be reset before launch.',
  beta: 'Beta: things may change, and progress may be reset before launch.',
};

/** The achievements a tester earns for good (fixed pseudo-season `special`, so they sit outside every season). */
export const SPECIAL_SEASON_ID = 'special';
export const SPECIAL_SEASON_NAME = 'Special';
export const TESTER_ACHIEVEMENTS: Record<TesterTier, { id: string; title: string; detail: string; icon: 'flask' | 'bug' }> = {
  alpha: { id: `${SPECIAL_SEASON_ID}:alpha-tester`, title: 'Alpha tester', detail: 'Helped test the Cheesy TCG in its closed alpha.', icon: 'flask' },
  beta: { id: `${SPECIAL_SEASON_ID}:beta-tester`, title: 'Beta tester', detail: 'Helped test the Cheesy TCG in its closed beta.', icon: 'bug' },
};
