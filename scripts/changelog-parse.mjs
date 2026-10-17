// Turns merged pull requests into changelog entries. Pure (no network, no fs): used by scripts/build-changelog.mjs at build time and
// tested by scripts/check-changelog.mts. ROADMAP 21.1.
//
// Only a PR's "## Changelog" section is ever read, never commit messages. The section ends at the next heading, a horizontal rule or the
// first line that starts with the robot emoji or "Generated with". Anything that names the tools or authors behind a change is dropped.
// Only the section's bulleted list is used (prose around it never ships), "none" on its first line skips the PR, markdown is turned into
// plain text, and planning PRs (titles starting "ROADMAP") are skipped.

export const MAX_ITEM_LENGTH = 500;
const EM_DASH = String.fromCharCode(8212);
const ROBOT = String.fromCodePoint(0x1f916);
/** Lines and titles matching this never reach the changelog (the owner's rule: no tool or author credits). */
export const BANNED = /claude|anthropic|co-authored-by|generated with/i;
const TAGS = ['new', 'improved', 'fixed'];

/** The lines of the Changelog section of a PR body, or null when there is none. */
export function changelogSection(body) {
  const lines = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex(l => /^#{1,6}\s+changelog\s*$/i.test(l.trim()));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,6}\s/.test(t) || /^([-*_])(\s*\1){2,}$/.test(t)) break;
    if (t.startsWith(ROBOT) || /^generated with/i.test(t)) break;
    out.push(lines[i]);
  }
  return out;
}

/** { title?, items } from a PR's Changelog section; null when it is missing, "none" or empty once cleaned. */
export function parseChangelogBody(body) {
  const section = changelogSection(body);
  if (!section) return null;
  const nonBlank = section.map(l => l.trimEnd()).filter(l => l.trim() !== '');
  if (nonBlank.length === 0) return null;
  // "none", "None.", "None (staff-only change)." on the first line leaves the PR out, whatever follows it.
  if (/^[-*]?\s*none\b/i.test(nonBlank[0].trim())) return null;
  // Only the bulleted list counts: prose before it is skipped, and the first plain line after it ends the section, so a PR's own
  // description can never leak onto the public page.
  let title;
  let audience = 'players';
  const tags = [];
  const items = [];
  let last = -1;
  for (const raw of nonBlank) {
    const line = raw.trim();
    const titleMatch = /^title:\s*(.+)$/i.exec(line);
    if (titleMatch && items.length === 0 && title === undefined) { title = titleMatch[1].trim(); last = -1; continue; }
    const audienceMatch = /^audience:\s*(.+)$/i.exec(line);
    if (audienceMatch && items.length === 0) { audience = parseAudience(audienceMatch[1]); last = -1; continue; }
    const tagsMatch = /^tags?:\s*(.+)$/i.exec(line);
    if (tagsMatch && items.length === 0) { for (const t of tagsMatch[1].toLowerCase().split(/[\s,]+/)) if (TAGS.includes(t) && !tags.includes(t)) tags.push(t); last = -1; continue; }
    const bullet = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) { items.push(bullet[2].trim()); last = items.length - 1; continue; }
    if (/^\s/.test(raw) && last >= 0) { items[last] += ' ' + line; continue; }
    if (items.length > 0) break;
  }
  const clean = items
    .map(i => plainText(i).trim())
    .filter(i => /[a-z0-9]/i.test(i) && !BANNED.test(i) && !/^none\.?$/i.test(i))
    .map(i => (i.length > MAX_ITEM_LENGTH ? i.slice(0, MAX_ITEM_LENGTH - 3).trimEnd() + '...' : i));
  if (clean.length === 0) return null;
  const t = title ? plainText(title).trim() : '';
  return { title: t && !BANNED.test(t) ? t : undefined, tags, audience, items: clean };
}

/**
 * Who a PR's changelog is for, from its "Audience:" line: players (the public What's new page, the default), staff (the admin and mod
 * What's new page only) or both. "public" / "everyone" and "admin" / "mod" / "mods" / "admins" are accepted too.
 */
export function parseAudience(v) {
  const words = String(v ?? '').toLowerCase().split(/[\s,/+&]+|\band\b/).filter(Boolean);
  const players = words.some(w => ['players', 'player', 'public', 'viewers', 'everyone', 'both', 'all'].includes(w));
  const staff = words.some(w => ['staff', 'admin', 'admins', 'mod', 'mods', 'moderators', 'both', 'all', 'everyone'].includes(w));
  return players && staff ? 'both' : staff ? 'staff' : 'players';
}

/** Markdown a player would see as symbols: bold / italic markers, inline code and links (keeps the link text). */
export function plainText(s) {
  return String(s ?? '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, '$1$2');
}

/** Planning PRs (titles starting "ROADMAP") never reach the public changelog. */
export const isRoadmapPr = (title) => /^\s*roadmap\b/i.test(String(title ?? ''));

/** The PR title without a trailing "(ROADMAP x.y)", "(Track x.y)" or "(x.y)" tag. */
export function cleanPrTitle(title) {
  return String(title ?? '').replace(/\s*\((?:(?:ROADMAP|Track)\b[^)]*|\d+\.\d+\w*)\)\s*$/i, '').trim();
}

/** One changelog entry from a GitHub pull request object, or null when it has none to show. */
export function entryFromPr(pr) {
  if (!pr || !pr.merged_at || isRoadmapPr(pr.title)) return null;
  const parsed = parseChangelogBody(pr.body);
  if (!parsed) return null;
  const fromPr = cleanPrTitle(pr.title);
  const title = parsed.title || (BANNED.test(fromPr) ? '' : fromPr) || 'Update';
  const labels = (pr.labels ?? []).map(l => String(typeof l === 'string' ? l : l?.name ?? '').toLowerCase());
  // The pills: a "Tags: new, fixed" line in the section, or the PR's labels (either works; kept in the page's order).
  const tags = TAGS.filter(t => labels.includes(t) || parsed.tags.includes(t));
  const entry = { date: String(pr.merged_at).slice(0, 10), title, items: parsed.items };
  if (tags.length) entry.tags = tags;
  if (parsed.audience !== 'players') entry.audience = parsed.audience;
  entry.pr = pr.number;
  return entry;
}

/** Why an entry may not ship, or null when it is fine. */
export function entryProblem(e) {
  const text = [e.title, ...e.items].join('\n');
  if (text.includes(EM_DASH)) return 'contains an em dash';
  if (BANNED.test(text)) return 'mentions a tool or author';
  return null;
}

/** Entries from a list of PRs: valid ones only, newest first (same day: higher PR number first). `problems` lists the dropped ones. */
export function buildEntries(prs, since = '') {
  const entries = [];
  const problems = [];
  for (const pr of prs) {
    const e = entryFromPr(pr);
    if (!e || e.date < since) continue;
    const why = entryProblem(e);
    if (why) { problems.push(`PR #${e.pr} "${e.title}" left out: ${why}`); continue; }
    entries.push(e);
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.pr - a.pr));
  return { entries, problems };
}
