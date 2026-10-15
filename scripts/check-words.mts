// The Privacy Policy and the FAQ quote numbers (how many events or notices are kept, for how many days, how long a pass lasts...).
// This reads the page source and the code constants and fails when they disagree, so a changed limit cannot leave the wording stale.
// Pure (reads files, no database). Run: npx tsx scripts/check-words.mts
import { readFileSync } from 'node:fs';
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

console.log('words checks passed');
