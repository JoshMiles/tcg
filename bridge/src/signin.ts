// Sign in with Twitch (ROADMAP 58.0b): the pure parts. The poll state machine (pending -> allowed / denied / expired / network trouble, with a time limit and Cancel),
// the page address to open, and the words for the signed-in account. Plain TypeScript, no Electron; src/main.ts runs it and scripts/check-signin.ts checks it.
import { staffActionsFor, type StaffRoleName } from './staffpages';

/** What `POST /api/bridge/link` answers. The secret stays in memory: it is never logged, saved or sent to the window. */
export interface LinkStart { id: string; code: string; secret: string; url: string; expiresAt: number }

/** What `POST /api/bridge/link/poll` answers (an `allowed` answer comes once; then the request is gone). */
export type LinkPollAnswer =
  | { status: 'pending' }
  | { status: 'denied'; message: string }
  | { status: 'expired' }
  | { status: 'allowed'; token: string; login: string; role: StaffRoleName | '' };

/** What the Connect screen shows. Never holds the secret or the token. */
export type SignInView =
  | { phase: 'starting' }
  | { phase: 'waiting'; code: string; note: string }
  | { phase: 'allowed'; login: string; role: StaffRoleName | '' }
  | { phase: 'denied'; message: string }
  | { phase: 'expired' }
  | { phase: 'cancelled' }
  | { phase: 'error'; message: string };

export interface SignInResult { view: SignInView; token?: string }

export interface SignInDeps {
  start(): Promise<LinkStart>;
  poll(id: string, secret: string): Promise<LinkPollAnswer>;
  show(view: SignInView): void;
  /** Resolves after `ms`, or at once when the signal aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  now(): number;
  signal: AbortSignal;
  everyMs?: number;
  limitMs?: number;
}

export const POLL_EVERY_MS = 2000;
export const POLL_LIMIT_MS = 10 * 60_000;
export const OFFLINE_NOTE = 'Cannot reach the site, still trying.';

/**
 * Starts a link request and polls it every 2 s for up to 10 minutes. Ends on the site's answer, the time limit or the signal.
 * A network error while polling only changes the note (the request lives on the site for 10 minutes); one at the start ends with an error.
 */
export async function runSignIn(o: SignInDeps): Promise<SignInResult> {
  const finish = (view: SignInView, token?: string): SignInResult => { o.show(view); return token ? { view, token } : { view }; };
  o.show({ phase: 'starting' });
  let link: LinkStart;
  try { link = await o.start(); } catch (e) {
    return o.signal.aborted ? finish({ phase: 'cancelled' }) : finish({ phase: 'error', message: e instanceof Error && e.message ? e.message : 'Could not reach the site' });
  }
  const until = o.now() + (o.limitMs ?? POLL_LIMIT_MS);
  let note = '';
  for (;;) {
    o.show({ phase: 'waiting', code: link.code, note });
    await o.sleep(o.everyMs ?? POLL_EVERY_MS, o.signal);
    if (o.signal.aborted) return finish({ phase: 'cancelled' });
    if (o.now() >= until) return finish({ phase: 'expired' });
    let answer: LinkPollAnswer;
    try { answer = await o.poll(link.id, link.secret); } catch { note = OFFLINE_NOTE; continue; }
    if (o.signal.aborted) return finish({ phase: 'cancelled' });
    note = '';
    if (answer.status === 'allowed') return finish({ phase: 'allowed', login: answer.login, role: answer.role }, answer.token);
    if (answer.status === 'denied') return finish({ phase: 'denied', message: answer.message });
    if (answer.status === 'expired') return finish({ phase: 'expired' });
  }
}

/** The page to open in the browser: the configured site's /bridge/link for this request id, or null when the id is not one the site makes. Never an address the site sent. */
export function linkPage(site: string, id: string): string | null {
  return /^[A-Za-z0-9_-]{22}$/.test(id) ? `${site}/bridge/link?id=${id}` : null;
}

export const ROLE_LABELS: Record<StaffRoleName, string> = { super: 'Super admin', admin: 'Admin', mod: 'Mod' };

/** A role from the site's answer, or '' for anything else (no role). */
export const cleanRole = (v: unknown): StaffRoleName | '' => (v === 'super' || v === 'admin' || v === 'mod' ? v : '');

/** The account in words: "Signed in with Twitch as <login> (<role>)" for a linked PC, "Paired as <name>" for one paired with a code. */
export function accountLabel(f: { login: string; role: string; pairedAs: string }): string {
  if (!f.login) return `Paired as ${f.pairedAs}`;
  const role = cleanRole(f.role);
  return `Signed in with Twitch as ${f.login} (${role ? ROLE_LABELS[role] : 'no staff role'})`;
}

/** What the staff pages show: the actions the role may use, or null (show everything) for a PC paired with a code, where the admin's switch decides. */
export const staffShown = (f: { login: string; role: string }): string[] | null => (f.login ? staffActionsFor(cleanRole(f.role) || null) : null);

/** The status answer's `account`, applied to a linked PC (never to a paired one). `changed` = the login or role differs from what was held. */
export function refreshAccount(cur: { login: string; role: string }, account: { login?: unknown; role?: unknown } | undefined): { login: string; role: StaffRoleName | ''; changed: boolean } {
  if (!cur.login || !account) return { login: cur.login, role: cleanRole(cur.role), changed: false };
  const login = typeof account.login === 'string' && account.login ? account.login.slice(0, 40) : cur.login;
  const role = cleanRole(account.role);
  return { login, role, changed: login !== cur.login || role !== cur.role };
}
