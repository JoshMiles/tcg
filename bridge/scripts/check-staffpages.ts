// The Staff pages' pure parts (ROADMAP 59.7): the viewer search, the viewer card's facts, the role to actions mapping, and the page layout.
// Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findViewers, STAFF_NEEDS, staffActionsFor, viewerFacts } from '../src/staffpages';

export function staffPagesChecks(): void {
  // Find a viewer: starts-with first, then contains, A to Z, at most 8, and a new valid name offered last.
  const users = ['brie_fan', 'cheesehead', 'abbie', 'curdnerd', 'bria', 'sabrina'];
  assert.deepEqual(findViewers(users, 'bri'), ['bria', 'brie_fan', 'sabrina', 'bri'], 'starts-with, then contains, then the typed name itself');
  assert.deepEqual(findViewers(users, '@Bria'), ['bria'], 'an @ and capitals are ignored; a name the site lists is not offered twice');
  assert.deepEqual(findViewers(users, ''), [], 'nothing typed, nothing listed');
  assert.deepEqual(findViewers(users, 'a b!'), [], 'a name that cannot be a Twitch name is not offered');
  assert.deepEqual(findViewers(users, 'zz'), ['zz'], 'a new viewer can still be looked up');
  assert.equal(findViewers(Array.from({ length: 30 }, (_, i) => `user${String(i).padStart(2, '0')}`), 'user').length, 8, 'at most 8');

  // The viewer card's facts.
  const facts = viewerFacts({ username: 'brie_fan', copies: 38, unique: 24, rank: 3, of: 112, bucks: 420, blocked: false, pulls: [{ text: 'Gouda Goat' }, { text: 'Brie Bear' }], refusals: [] });
  assert.deepEqual(facts, [['Pulls', 'Allowed'], ['Cards', '38 owned, 24 different'], ['Rank', '3 of 112'], ['Brie Bucks', '420'], ['Last pulls', 'Gouda Goat, Brie Bear'], ['Refusals', 'None']]);
  const bare = Object.fromEntries(viewerFacts({ blocked: true, rank: null, bucks: null }));
  assert.equal(bare.Pulls, 'Blocked');
  assert.equal(bare.Rank, 'Not ranked');
  assert.match(bare['Brie Bucks'], /^Unknown/, 'Mix It Up not answering is said, not shown as 0');
  assert.equal(bare.Cards, '0 owned, 0 different', 'a missing number is 0, never undefined');

  // Roles: a mod keeps trading, block, unblock, scene and the reads state, users, activity, viewer; an admin and a super admin keep everything; no role keeps nothing.
  const all = Object.keys(STAFF_NEEDS).sort();
  assert.deepEqual(staffActionsFor('mod').sort(), ['activity', 'block', 'scene', 'state', 'trading', 'unblock', 'users', 'viewer']);
  assert.deepEqual(staffActionsFor('admin').sort(), all);
  assert.deepEqual(staffActionsFor('super').sort(), all);
  assert.deepEqual(staffActionsFor(null), []);
  for (const gift of ['gift', 'grant', 'show-collection', 'show-card', 'stream-extra', 'backup', 'preview-url', 'cards', 'search']) assert.ok(!staffActionsFor('mod').includes(gift), `${gift} needs an admin`);

  // The mapping mirrors the site's: every key of STAFF_CAPABILITY in lib/bridge-core.ts has the same need here (read as text, the app and the site are separate builds).
  const core = readFileSync(join(__dirname, '..', '..', 'lib', 'bridge-core.ts'), 'utf8');
  const block = /export const STAFF_CAPABILITY[^{]*\{([\s\S]*?)\n\};/.exec(core)?.[1] ?? '';
  const site = Object.fromEntries([...block.matchAll(/'?([a-z-]+)'?: '(admin|mod)'/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(site, STAFF_NEEDS, 'the app lists the same actions and reads, with the same roles, as the site');

  // The page: the viewer card is a region with a heading, the results a list, and the scene select has an empty state.
  const html = readFileSync(join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  assert.match(html, /id="staff-viewer-card"[^>]*role="region"[^>]*aria-labelledby="staff-viewer-title"/);
  assert.match(html, /<h2 id="staff-viewer-title"/);
  assert.match(html, /<ul id="staff-found"[^>]*>/);
  assert.match(html, /id="staff-scene-empty" class="empty"/);
  assert.match(html, /id="staff-variant-empty" class="empty"/);
  for (const label of ['Gift packs', 'Show collection', 'Grant card', 'Show card on stream', 'Block from pulls', 'Lift block', 'Clear', 'Set extra pulls', 'Switch scene', 'Pause trading', 'Open the preview', 'Back up now']) assert.ok(html.includes(`>${label}</button>`), `${label} is still reachable`);
}
