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

console.log('changelog checks passed');
