// The changelog: entries are well formed, newest-first order is not required in the file (the page sorts), no em dashes or old print
// wording, and the "new since your last visit" dot logic. Pure. Run: npx tsx scripts/check-changelog.mts
import { CHANGELOG, hasUnseenChanges, newestChangelogDate } from '../lib/changelog';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

ok(CHANGELOG.length > 0, 'there is at least one entry');
for (const e of CHANGELOG) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && !Number.isNaN(Date.parse(e.date)), `entry "${e.title}" has a YYYY-MM-DD date`);
  ok(e.title.trim().length > 0 && e.items.length > 0 && e.items.every(i => i.trim().length > 0), `entry "${e.title}" has a title and items`);
  for (const t of e.tags ?? []) ok(['new', 'improved', 'fixed'].includes(t), `entry "${e.title}" uses a known tag`);
  const text = [e.title, ...e.items].join('\n');
  ok(!text.includes(String.fromCharCode(8212)), `entry "${e.title}" has no em dash`);
  ok(!/unique copy number|unique number|copy page|ID #/i.test(text), `entry "${e.title}" says "print", not the old copy wording`);
}

const newest = newestChangelogDate();
ok(newest === [...CHANGELOG].map(e => e.date).sort().pop(), 'newest date is the latest entry date');
ok(hasUnseenChanges(null, newest), 'a first-time visitor sees the dot');
ok(hasUnseenChanges('2000-01-01', newest), 'an older last visit sees the dot');
ok(!hasUnseenChanges(newest, newest), 'the dot is gone once the newest entry is seen');
ok(!hasUnseenChanges(null, ''), 'no entries, no dot');

// ---- built from PR descriptions (ROADMAP 21.1): parser, no network ----
import { buildEntries, entryFromPr, parseChangelogBody, MAX_ITEM_LENGTH } from './changelog-parse.mjs';

const ROBOT = String.fromCodePoint(0x1f916);
const EM = String.fromCharCode(8212);
const pr = (n: number, title: string, body: string | null, labels: string[] = [], mergedAt: string | null = '2026-10-18T10:00:00Z') =>
  ({ number: n, title, body, merged_at: mergedAt, labels: labels.map(name => ({ name })) });
const leak = (e: { title: string; items: string[] }) => /claude|anthropic|co-authored-by|generated with/i.test([e.title, ...e.items].join('\n'));

// a normal section stops at the next heading, and the footer never leaks
const footer = `\n${ROBOT} Generated with [Claude Code](https://claude.com/claude-code)\n`;
const basic = parseChangelogBody(`## Changelog\n- You can now sort your binder.\n- Prints show their number.\n\n## Summary\nInternal notes about Claude.\n${footer}`);
ok(basic && basic.items.length === 2 && basic.items[0] === 'You can now sort your binder.', 'section is found and stops at the next heading');

// the footer directly under the section, with no heading or rule between
const bare = parseChangelogBody(`## Changelog\n- Trades are faster.\n${footer}`);
ok(bare && bare.items.length === 1 && !leak({ title: '', items: bare.items }), 'a Generated with footer right after the section does not leak');
const bare2 = parseChangelogBody(`## Changelog\n- Trades are faster.\nGenerated with Claude Code`);
ok(bare2 && bare2.items.length === 1, '"Generated with" without the emoji also ends the section');

// a rule ends the section, so what follows it is never read
const rule = parseChangelogBody(`## Changelog\n- Faster pages.\n---\n- Written by Claude.\n`);
ok(rule && rule.items.length === 1 && rule.items[0] === 'Faster pages.', 'a horizontal rule ends the section');

// a Co-Authored-By or tool line inside the section is dropped, the rest stays
const inside = parseChangelogBody(`## Changelog\n- Better search.\n- Co-Authored-By: Claude Sonnet <noreply@anthropic.com>\n- Built with Claude, it is quicker.\n- Anthropic-powered help text.\n`);
ok(inside && inside.items.length === 1 && inside.items[0] === 'Better search.', 'Co-Authored-By and tool mentions inside the section are dropped');
ok(parseChangelogBody('## Changelog\n- Co-Authored-By: Claude <x@y.z>\n') === null, 'a section with only credits yields no entry');

// none, missing, empty, template placeholder
ok(parseChangelogBody('## Changelog\nnone\n\n## Summary\nx') === null, '"none" leaves the PR out');
ok(parseChangelogBody('## Changelog\nNone.') === null, '"None." leaves the PR out');
ok(parseChangelogBody('## Changelog\nNone (staff-only change).') === null, '"None (staff-only change)." leaves the PR out');
ok(entryFromPr(pr(30, 'Pack workspace shell (20.2a)', '## Changelog\n- Packs open in a workspace.'))?.title === 'Pack workspace shell', 'a trailing (20.2a) is removed from the title');
ok(parseChangelogBody('## Summary\nno section here') === null, 'no section leaves the PR out');
ok(parseChangelogBody(null) === null && parseChangelogBody('') === null, 'a missing body is fine');
ok(parseChangelogBody('## Changelog\n<!-- For players. Write none. -->\n- \n\n## Summary\nx') === null, 'the untouched template yields nothing');
ok(parseChangelogBody('## Changelog\r\n- Works with Windows line endings.\r\n\r\n## Summary\r\nx')?.items[0] === 'Works with Windows line endings.', 'CRLF bodies parse');

// title override, PR title cleanup, labels, date, pr number
const withTitle = entryFromPr(pr(7, 'Pack workspace shell (ROADMAP 20.2a)', '## Changelog\nTitle: Build packs in one place\n- Packs open in a workspace.', ['fixed', 'new', 'wip']));
ok(withTitle && withTitle.title === 'Build packs in one place', 'a Title: first line overrides the PR title');
ok(withTitle && withTitle.tags?.join() === 'new,fixed' && withTitle.date === '2026-10-18' && withTitle.pr === 7, 'labels become tags, date is the merge day, pr is kept');
const noTitle = entryFromPr(pr(8, 'Pack workspace shell (ROADMAP 20.2a)', '## Changelog\n- Packs open in a workspace.'));
ok(noTitle && noTitle.title === 'Pack workspace shell' && !noTitle.tags, 'the PR title loses its (ROADMAP x.y) suffix');
ok(entryFromPr(pr(9, 'Not merged', '## Changelog\n- x here.', [], null)) === null, 'a PR that was never merged is left out');

// a title naming the tool is replaced, never shown
const badTitle = entryFromPr(pr(10, 'Claude fixes the binder', '## Changelog\n- The binder loads faster.'));
ok(badTitle && !leak(badTitle) && badTitle.title === 'Update', 'a PR title naming a tool is replaced');
const badOverride = entryFromPr(pr(11, 'Binder speed', '## Changelog\nTitle: Made by Claude\n- The binder loads faster.'));
ok(badOverride && badOverride.title === 'Binder speed', 'a Title: line naming a tool falls back to the PR title');

// the 500-character cap per item
const long = parseChangelogBody(`## Changelog\n- ${'a'.repeat(900)}`);
ok(long && long.items[0].length === MAX_ITEM_LENGTH, 'an item is capped at 500 characters');

// buildEntries: order, cutoff, em dash dropped, nothing leaks
const built = buildEntries([
  pr(20, 'Older', '## Changelog\n- An older thing.', [], '2026-10-17T09:00:00Z'),
  pr(21, 'Newer', '## Changelog\n- A newer thing.', [], '2026-10-19T09:00:00Z'),
  pr(22, 'Same day later', `## Changelog\n- Another thing ${footer}`, [], '2026-10-19T12:00:00Z'),
  pr(23, 'Dashy', `## Changelog\n- A thing ${EM} with a dash.`, [], '2026-10-19T13:00:00Z'),
  pr(24, 'Before ship', '## Changelog\n- Too old.', [], '2026-10-01T09:00:00Z'),
  pr(25, 'Internal', '## Changelog\nnone', [], '2026-10-19T14:00:00Z'),
], '2026-10-17');
ok(built.entries.map(e => e.pr).join() === '22,21,20', 'entries are newest first, same day by PR number, and older than the cutoff are skipped');
ok(built.problems.length === 1 && /#23/.test(built.problems[0]), 'an entry with an em dash is left out and reported');
ok(built.entries.every(e => !leak(e) && ![e.title, ...e.items].join('').includes(EM)), 'no generated entry mentions a tool or contains an em dash');

// whatever the build wrote (the committed state is empty) must be clean too
ok(CHANGELOG.filter(e => e.pr !== undefined).every(e => !leak(e)), 'generated entries on disk never mention Claude');

console.log('changelog checks passed');
