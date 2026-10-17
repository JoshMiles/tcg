// Turns merged pull requests into changelog entries. Pure (no network, no fs): used by scripts/build-changelog.mjs at build time and
// tested by scripts/check-changelog.mts. ROADMAP 21.1.
//
// Only a PR's "## Changelog" section is ever read, never commit messages. The section ends at the next heading, a horizontal rule or the
// first line that starts with the robot emoji or "Generated with". Anything that names the tools or authors behind a change is dropped.

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
  // "none", "None.", "None (staff-only change)." as the only content
  if (nonBlank.length === 1 && /^[-*]?\s*none\b[^a-z0-9]*(\([^)]*\))?[^a-z0-9]*$/i.test(nonBlank[0].trim())) return null;
  let title;
  const items = [];
  let last = -1;
  for (const raw of nonBlank) {
    const line = raw.trim();
    const titleMatch = /^title:\s*(.+)$/i.exec(line);
    if (titleMatch && items.length === 0 && title === undefined) { title = titleMatch[1].trim(); last = -1; continue; }
    const bullet = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) { items.push(bullet[2].trim()); last = items.length - 1; continue; }
    if (/^\s/.test(raw) && last >= 0) { items[last] += ' ' + line; continue; }
    items.push(line);
    last = items.length - 1;
  }
  const clean = items
    .map(i => i.trim())
    .filter(i => /[a-z0-9]/i.test(i) && !BANNED.test(i) && !/^none\.?$/i.test(i))
    .map(i => (i.length > MAX_ITEM_LENGTH ? i.slice(0, MAX_ITEM_LENGTH - 3).trimEnd() + '...' : i));
  if (clean.length === 0) return null;
  return { title: title && !BANNED.test(title) ? title : undefined, items: clean };
}

/** The PR title without a trailing "(ROADMAP x.y)", "(Track x.y)" or "(x.y)" tag. */
export function cleanPrTitle(title) {
  return String(title ?? '').replace(/\s*\((?:(?:ROADMAP|Track)\b[^)]*|\d+\.\d+\w*)\)\s*$/i, '').trim();
}

/** One changelog entry from a GitHub pull request object, or null when it has none to show. */
export function entryFromPr(pr) {
  if (!pr || !pr.merged_at) return null;
  const parsed = parseChangelogBody(pr.body);
  if (!parsed) return null;
  const fromPr = cleanPrTitle(pr.title);
  const title = parsed.title || (BANNED.test(fromPr) ? '' : fromPr) || 'Update';
  const labels = (pr.labels ?? []).map(l => String(typeof l === 'string' ? l : l?.name ?? '').toLowerCase());
  const tags = TAGS.filter(t => labels.includes(t));
  const entry = { date: String(pr.merged_at).slice(0, 10), title, items: parsed.items };
  if (tags.length) entry.tags = tags;
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
