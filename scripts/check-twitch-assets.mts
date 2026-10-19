// Checks the Twitch extension submission pack: the image files exist at the sizes Twitch asks for (and the two that must be opaque are),
// and the text in twitch-extension/SUBMISSION.md fits the field limits. Run: npx tsx scripts/check-twitch-assets.mts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const dir = join(process.cwd(), 'twitch-extension');

async function size(file: string) {
  ok(existsSync(join(dir, file)), `${file} exists`);
  const m = await sharp(join(dir, file)).metadata();
  return { w: m.width, h: m.height, alpha: !!m.hasAlpha };
}

const icon = await size('icon-100.png');
ok(icon.w === 100 && icon.h === 100 && !icon.alpha, 'the icon is 100 x 100 and opaque');
const disc = await size('discovery-300x200.png');
ok(disc.w === 300 && disc.h === 200 && !disc.alpha, 'the discovery image is 300 x 200 and not transparent');
const shots = ['01-collection', '02-card-detail', '03-stats', '04-leaderboard', '05-trades'];
for (const s of shots) {
  const m = await size(`screenshots/${s}.png`);
  ok(m.w === 1024 && m.h === 768, `${s} is 1024 x 768`);
}
ok(shots.length >= 3, 'at least three screenshots');

// The text blocks in the submission pack.
const doc = readFileSync(join(dir, 'SUBMISSION.md'), 'utf8').replace(/\r\n/g, '\n');
const blocks = [...doc.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)].map(m => m[1]); // every fenced block, with or without a language tag
const name = blocks.find(b => b === 'The Cheesy TCG');
const summary = blocks.find(b => b.startsWith('Collect trading cards'));
const details = blocks.find(b => b.startsWith('The Cheesy TCG is a collectible'));
ok(name && name.length <= 40 && !/extension|twitch/i.test(name), 'the name is 40 characters or fewer and has no "extension" or "twitch"');
ok(summary && summary.length <= 140, `the summary is 140 characters or fewer (${summary?.length})`);
ok(details && details.length <= 1024, `the details are 1,024 characters or fewer (${details?.length})`);
ok(!doc.includes(String.fromCharCode(0x2014)), 'the pack has no em dashes');

console.log('twitch asset checks passed');
