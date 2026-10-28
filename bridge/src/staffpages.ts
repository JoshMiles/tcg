// The Staff pages' pure parts (ROADMAP 59.7): which viewers a typed name finds, the viewer card's facts, and which staff things a role may use.
// Plain TypeScript, no Electron; src/staff.ts runs it and scripts/check-staffpages.ts checks it.

export type StaffRoleName = 'super' | 'admin' | 'mod';

/** Every action and read the staff pages use, with the role the site wants for it. Mirrors STAFF_CAPABILITY in lib/bridge-core.ts: a mod may do trading, block, unblock, scene and the reads state, users, activity and viewer; the rest is admin. */
export const STAFF_NEEDS: Record<string, 'admin' | 'mod'> = {
  gift: 'admin', 'show-collection': 'admin', 'show-card': 'admin', grant: 'admin', 'stream-extra': 'admin', backup: 'admin', 'preview-url': 'admin', 'test-pull': 'admin',
  trading: 'mod', block: 'mod', unblock: 'mod', scene: 'mod',
  state: 'mod', users: 'mod', activity: 'mod', viewer: 'mod', cards: 'admin', search: 'admin',
};

/**
 * What a signed-in account may use, by its site role (58.0b: the window hides the rest). null is a PC signed in with no role: nothing.
 * The site still refuses what a role cannot do, so a stale role never gets past it.
 */
export function staffActionsFor(role: StaffRoleName | null): string[] {
  if (!role) return [];
  return Object.keys(STAFF_NEEDS).filter(name => role !== 'mod' || STAFF_NEEDS[name] === 'mod');
}

const MAX_FOUND = 8;

/**
 * The viewers to list under "Find a viewer": names that start with what was typed first, then names that contain it, each group A to Z, at most 8.
 * When the typed text is a valid Twitch name the site does not list (a new viewer), it is offered last so it can still be looked up.
 */
export function findViewers(users: string[], typed: string): string[] {
  const q = typed.trim().replace(/^@/, '').toLowerCase();
  if (!q) return [];
  const starts = users.filter(u => u.startsWith(q)).sort();
  const has = users.filter(u => !u.startsWith(q) && u.includes(q)).sort();
  const found = [...starts, ...has].slice(0, MAX_FOUND);
  if (/^[a-z0-9_]{2,25}$/.test(q) && !users.includes(q) && found.length < MAX_FOUND) found.push(q);
  return found;
}

/** The viewer card's key facts from the site's viewer read plus Brie Bucks from Mix It Up: label and value, in the order shown. */
export function viewerFacts(d: Record<string, unknown>): [string, string][] {
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text : '')).filter(Boolean) : []);
  const pulls = texts(d.pulls);
  const refusals = texts(d.refusals);
  const rank = num(d.rank);
  return [
    ['Pulls', d.blocked === true ? 'Blocked' : 'Allowed'],
    ['Cards', `${num(d.copies)} owned, ${num(d.unique)} different`],
    ['Rank', rank > 0 ? `${rank} of ${num(d.of)}` : 'Not ranked'],
    ['Brie Bucks', typeof d.bucks === 'number' ? String(d.bucks) : 'Unknown (Mix It Up is not answering)'],
    ['Last pulls', pulls.length ? pulls.join(', ') : 'None'],
    ['Refusals', refusals.length ? refusals.join(', ') : 'None'],
  ];
}
