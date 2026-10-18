// The Privacy Policy and the FAQ quote numbers (how many events or notices are kept, for how many days, how long a pass lasts...).
// This reads the page source and the code constants and fails when they disagree, so a changed limit cannot leave the wording stale.
// Pure (reads files, no database). Run: npx tsx scripts/check-words.mts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const fromCode = (file: string, re: RegExp): number => {
  const m = re.exec(read(file));
  if (!m) throw new Error(`could not find ${re} in ${file}`);
  return Number(m[1]);
};

const privacy = read('app/privacy/page.tsx');
const faq = read('app/(site)/faq/page.tsx');
const terms = read('app/terms/page.tsx');
const has = (text: string, phrase: string, label: string) => ok(text.includes(phrase), `${label}: the page says "${phrase}"`);

// ---- what is kept, and for how long ----
has(privacy, `latest ${fromCode('lib/activity.ts', /const LOG_CAP = (\d+)/)} events`, 'activity log size');
has(privacy, `latest ${fromCode('lib/trades.ts', /const HISTORY_CAP = (\d+)/)} finished trades`, 'trade history size');
has(privacy, `newest ${fromCode('lib/trade-notify.ts', /const NOTICE_CAP = (\d+)/)}`, 'bell notices kept');
has(privacy, `newest ${fromCode('lib/score-history-core.ts', /export const HISTORY_CAP = (\d+)/)} per season`, 'score samples kept');
ok(faq.includes('Request deletion') && privacy.includes('Request deletion') && terms.includes('Request deletion'), 'the FAQ, Privacy Policy and Terms all describe the Request deletion button');
ok(faq.includes('14 days') && privacy.includes('restore point'), 'the 14-day restore point is stated');
// The feedback wording reads its numbers from the limits themselves, so it cannot drift; check it still does.
has(privacy, 'FEEDBACK_LIMITS.keepDaysAfterResolved} days after that, then deleted', 'feedback retention comes from the limit');
has(privacy, 'You can send {FEEDBACK_LIMITS.perDay} a day', 'feedback daily limit comes from the limit');
has(faq, 'FEEDBACK_LIMITS.keepDaysAfterResolved} days after', 'the FAQ feedback retention comes from the limit');
has(privacy, `kept for ${fromCode('lib/user-admin.ts', /const SNAP_TTL = (\d+) \* 24/)} days`, 'restore points');
has(privacy, `up to ${fromCode('lib/avatars.ts', /const TTL_FOUND = (\d+) \* 24/)} days`, 'cached profile pictures');
has(privacy, `up to ${fromCode('lib/session.ts', /const MAX_AGE_S = 60 \* 60 \* 24 \* (\d+)/)} days`, 'login cookie lifetime');
const passMinutes = fromCode('lib/captcha.ts', /export const PASS_SECONDS = (\d+) \* 60/);
has(privacy, `about ${passMinutes} minutes`, 'Turnstile pass in the privacy policy');
has(faq, `about ${passMinutes} minutes`, 'Turnstile pass in the FAQ');
has(faq, `(up to ${fromCode('lib/user-settings.ts', /export const WATCH_MAX = (\d+)/)})`, 'saved alerts');

// ---- the channel-only rule is stated in all three places ----
ok(faq.includes('Only on <a href={CHANNEL_URL}') && /run anywhere el/.test(faq), 'the FAQ says the game runs only on the channel');
ok(terms.includes('runs only on the {CHANNEL_NAME} Twitch channel'), 'the Terms say the game runs only on the channel');
ok(privacy.includes('played only on the {CHANNEL_NAME} Twitch channel'), 'the Privacy Policy says the game is played only on the channel');

// ---- plain wording rules from CLAUDE.md ----
for (const [name, text] of [['faq', faq], ['privacy', privacy], ['terms', terms]] as const) {
  ok(!text.includes(String.fromCharCode(8212)), `${name}: no em dash`);
}
ok(!/in seasons that enable it\. Can/.test(terms), 'the Terms sentence about upgrades is one sentence');
ok(!faq.includes('>Collections</Link> or the search box'), 'the FAQ calls the page Collectors, as the nav does');

// ---- a card copy is a "print" (ROADMAP 2.6): the old names must not come back into user-facing text ----
// Narrow on purpose: code identifiers (copy, uid, Copy) and comments are fine, only phrases a viewer would read are banned.
const walkSrc = (dir: string, re: RegExp, out: string[] = []): string[] => {
  for (const f of readdirSync(join(root, dir))) {
    const rel = dir + '/' + f;
    if (statSync(join(root, rel)).isDirectory()) walkSrc(rel, re, out);
    else if (re.test(f)) out.push(rel);
  }
  return out;
};
const withoutComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(l => !/^\s*(\/\/|\*)/.test(l))
  .map(l => l.replace(/\s\/\/ .*$/, ''))
  .join('\n');
const userFacing = [...walkSrc('app', /\.tsx$/), 'public/widget.js', 'public/widget-dev.js', 'lib/discord.ts', 'lib/flip-back.ts', 'lib/share-image.ts', 'lib/changelog.ts'];
const banned: [RegExp, string][] = [[/unique copy number/i, 'unique copy number'], [/unique number/i, 'unique number'], [/copy page/i, 'copy page'], [/ID #/, 'ID #']];
for (const file of userFacing) {
  const src = withoutComments(read(file));
  for (const [re, label] of banned) ok(!re.test(src), `${file} says "${label}": a card copy is a print (ROADMAP 2.6), so use "print number", "print page" or "Print #1023381"`);
}
// ---- the two set bonuses are the "progress bonus" and the "full set bonus" (ROADMAP 7.8); the FAQ alone may name the old words ("it used to be called") ----
const oldBonusNames = /completion bonus|complete[- ](set|collection) bonus/i;
for (const file of userFacing.filter(f => f !== 'app/(site)/faq/page.tsx')) ok(!oldBonusNames.test(withoutComments(read(file))), `${file} uses an old bonus name: say "progress bonus" or "full set bonus"`);
ok(faq.includes('it used to be called the completion bonus'), 'the FAQ keeps the old progress bonus name findable');
ok(faq.includes('it used to be called the complete collection bonus'), 'the FAQ keeps the old full set bonus name findable');
ok(faq.includes('id="serials"') && faq.includes('id="prints"'), 'the FAQ keeps the #serials anchor and adds #prints');

// ---- the info tooltips (ROADMAP 7.9): every glossary link lands on a real FAQ anchor, and the wording follows the house rules ----
const glossary = read('lib/glossary.ts');
const faqAnchors = new Set([...faq.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const entries = [...glossary.matchAll(/^  (\w+): \{\n([\s\S]*?)\n  \},$/gm)];
ok(entries.length >= 15, `the glossary has its first terms (found ${entries.length})`);
for (const [, term, block] of entries) {
  const anchor = /faq: '([^']+)'/.exec(block)?.[1];
  ok(!anchor || faqAnchors.has(anchor), `glossary term ${term} links to #${anchor}, which the FAQ does not have`);
  ok(/title: '/.test(block) && /body: '/.test(block), `glossary term ${term} has a title and a body`);
}
ok(!glossary.includes(String.fromCharCode(8212)) && !/\p{Extended_Pictographic}/u.test(glossary), 'the glossary has no em dash and no emoji');
ok(!oldBonusNames.test(glossary), 'the glossary uses the new bonus names');

console.log('words checks passed');
