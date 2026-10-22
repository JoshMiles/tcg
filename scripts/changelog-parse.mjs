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
  let text = String(body ?? '');
  for (let prev = null; prev !== text;) { prev = text; text = text.replace(/<!--[\s\S]*?-->/g, ''); }
  const lines = text.split(/\r?\n/);
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
  let audience = ['players'];
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
 * Who a PR's changelog is for, from its "Audience:" line: a sorted subset of players (the public What's new page, the default), admin
 * and mod. "staff" means admin and mod; "both" / "all" / "everyone" mean all three.
 */
export function parseAudience(v) {
  const words = String(v ?? '').toLowerCase().split(/[\s,/+&]+|\band\b/).filter(Boolean);
  const has = (...ws) => words.some(w => ws.includes(w));
  const all = has('both', 'all', 'everyone');
  const out = [];
  if (all || has('admin', 'admins', 'staff')) out.push('admin');
  if (all || has('mod', 'mods', 'moderators', 'staff')) out.push('mod');
  if (all || has('players', 'player', 'public', 'viewers')) out.push('players');
  return out.length ? out.sort() : ['players'];
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
  if (parsed.audience.join() !== 'players') entry.audience = parsed.audience;
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

const AUDIENCE_WORDS = ['both', 'all', 'everyone', 'admin', 'admins', 'staff', 'mod', 'mods', 'moderators', 'players', 'player', 'public', 'viewers'];
const REQUIRED_HEADINGS = ['Changelog', 'Summary', 'Test plan'];

/**
 * Everything wrong with a PR body against .github/pull_request_template.md (empty list = fine). Stricter than parseChangelogBody, which
 * quietly drops what it can't read: here a body that would lose its changelog text fails instead. `title` is unused today (ROADMAP PRs
 * follow the same rules, and may write "none"); kept so callers pass what they have.
 */
export function prBodyProblems(body, title) {
  let text = String(body ?? '');
  for (let prev = null; prev !== text;) { prev = text; text = text.replace(/<!--[\s\S]*?-->/g, ''); }
  const lines = text.split(/\r?\n/);
  const problems = [];

  // Split into level-2 sections. Text before the first heading and after Test plan (the attribution footer) is not checked.
  const sections = [];
  for (const line of lines) {
    const h = /^##\s+(.*?)\s*$/.exec(line);
    if (h && !line.startsWith('###')) sections.push({ name: h[1], lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
  }
  const names = sections.map(s => s.name);
  if (names.join('|') !== REQUIRED_HEADINGS.join('|')) {
    problems.push(`Headings must be exactly "## Changelog", "## Summary", "## Test plan" once each, in that order; found: ${names.map(n => `"## ${n}"`).join(', ') || 'none'}.`);
  }
  const content = (name) => (sections.find(s => s.name === name)?.lines ?? []).map(l => l.trimEnd()).filter(l => l.trim() !== '');

  const log = content('Changelog');
  if (sections.some(s => s.name === 'Changelog')) {
    if (log.length === 0) problems.push('Changelog is empty: write "none" or fill in Audience, Tags and bullets.');
    else if (/^none\b/i.test(log[0].trim())) {
      if (log.length > 1) problems.push('Changelog starts with "none" but has more lines; keep only the "none" line.');
    } else problems.push(...changelogProblems(log));
  }
  for (const name of ['Summary', 'Test plan']) {
    if (sections.some(s => s.name === name) && content(name).length === 0) problems.push(`"## ${name}" is empty.`);
  }
  return problems;
}

/** Problems in a filled-in (not "none") Changelog section: Audience, optional Title, Tags, then only real bullets. */
function changelogProblems(log) {
  const problems = [];
  const lines = log.map(l => l.trim());
  let i = 0;
  const audience = /^audience:\s*(.*)$/i.exec(lines[i] ?? '');
  if (!audience) problems.push('Changelog must start with an "Audience:" line (players, admin, mod, staff or all).');
  else {
    i++;
    const words = audience[1].toLowerCase().split(/[\s,/+&]+|\band\b/).filter(Boolean);
    const unknown = words.filter(w => !AUDIENCE_WORDS.includes(w));
    if (words.length === 0) problems.push('"Audience:" is empty.');
    if (unknown.length) problems.push(`Unknown audience: ${unknown.join(', ')}. Use players, admin, mod, staff or all.`);
  }
  const title = /^title:\s*(.*)$/i.exec(lines[i] ?? '');
  if (title) {
    i++;
    if (!title[1].trim()) problems.push('"Title:" is empty: fill it in or delete the line.');
    else if (title[1].includes(EM_DASH)) problems.push('Title has an em dash.');
  }
  const tags = /^tags:\s*(.*)$/i.exec(lines[i] ?? '');
  if (!tags) problems.push('Changelog needs a "Tags:" line (new, improved, fixed) after Audience and the optional Title.');
  else {
    i++;
    const words = tags[1].toLowerCase().split(/[\s,]+/).filter(Boolean);
    const unknown = words.filter(w => !TAGS.includes(w));
    if (words.length === 0) problems.push('"Tags:" is empty: use new, improved and/or fixed.');
    if (unknown.length) problems.push(`Unknown tag: ${unknown.join(', ')}. Use new, improved or fixed.`);
  }
  const rest = lines.slice(i);
  if (!rest.some(l => /^-\s+\S/.test(l))) problems.push('Changelog needs at least one "- " bullet with text.');
  for (const l of rest) {
    if (/^-\s*$/.test(l)) problems.push('Changelog has an empty "- " bullet (the template\'s placeholder): fill it in or remove it.');
    else if (!/^-\s/.test(l)) problems.push(`Changelog line is not a bullet and would be dropped from What's new: "${l.slice(0, 60)}".`);
    else {
      if (l.includes(EM_DASH)) problems.push(`Bullet has an em dash: "${l.slice(0, 60)}".`);
      if (BANNED.test(l)) problems.push(`Bullet names a tool or author (not allowed): "${l.slice(0, 60)}".`);
    }
  }
  return problems;
}
