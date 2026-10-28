// The Home dashboard's pure parts (ROADMAP 59.5): the merged feed and its filters, the "this stream" numbers, the checklist's summary line, and the page layout.
// Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EventLine } from '../src/events';
import { FEED_FILTERS, filterFeed, keepPull, mergeFeed, PULLS_KEEP, readySummary, streamNumbers, type PullEntry } from '../src/home';

const t0 = new Date(2026, 9, 28, 19, 28, 0).getTime();
const pull = (s: number, viewer: string, stars: number, extra: Partial<PullEntry> = {}): PullEntry => ({ at: t0 + s * 1000, viewer, card: 'Gouda Goat', rarity: stars >= 4 ? 'Legendary' : 'Common', stars, variant: 'Regular', ...extra });
const event = (s: number, ok: boolean): EventLine => ({ at: t0 + s * 1000, time: '19:28:10', event: 'Bits', viewer: 'ann', amount: '1,500', ok, result: ok ? '3 packs' : 'Ignored: event off' });
const job = (s: number, ok: boolean) => ({ at: t0 + s * 1000, kind: 'deduct', username: ok ? 'bob' : '', ok, detail: ok ? 'Took 50 Brie Bucks' : 'Not enough Brie Bucks', ms: 5 });

export function homeChecks(): void {
  // One feed, newest first, a tie keeps pulls, events, jobs in that order.
  const rows = mergeFeed([pull(5, 'cy', 5), pull(1, 'di', 2, { variant: 'Holo' })], [event(3, true), event(5, false)], [job(4, true), job(2, false)]);
  assert.deepEqual(rows.map(r => [r.kind, r.badge, r.tag]), [['pull', 'P', 'Legendary'], ['event', '!', 'refused'], ['job', 'J', 'ok'], ['event', 'E', 'rewarded'], ['job', '!', 'failed'], ['pull', 'P', 'Common']], 'merged newest first with kind badges and tags');
  assert.equal(rows[0].tone, 'rare', 'a 4 star pull is marked');
  assert.equal(rows[5].text, 'Gouda Goat (Holo)', 'a variant other than Regular is named');
  assert.equal(rows[1].text, 'Bits 1,500: Ignored: event off');
  assert.equal(rows[2].viewer, 'bob');
  assert.equal(rows[4].viewer, '-', 'a job with no viewer shows a dash');
  assert.equal(mergeFeed([pull(1, 'a', 1), pull(2, 'b', 1), pull(3, 'c', 1)], [], [], 2).length, 2, 'the limit cuts the oldest');
  assert.deepEqual(mergeFeed([], [], []), [], 'nothing yet');

  // Filters.
  assert.deepEqual(FEED_FILTERS.map(f => f.id), ['all', 'pulls', 'events', 'jobs'], 'the filters the window shows (no Twitch one yet)');
  assert.equal(filterFeed(rows, 'all').length, 6);
  assert.deepEqual(filterFeed(rows, 'pulls').map(r => r.kind), ['pull', 'pull']);
  assert.deepEqual(filterFeed(rows, 'events').map(r => r.kind), ['event', 'event']);
  assert.deepEqual(filterFeed(rows, 'jobs').map(r => r.kind), ['job', 'job']);
  assert.ok(filterFeed(rows, 'jobs').some(r => r.badge === '!'), 'a failed job is in Jobs');

  // Twitch events (58.5) are event rows: E when the award ran or nothing was refused, ! with "refused" when the award failed (paused included).
  const tw = mergeFeed([], [
    { at: t0 + 3000, time: '19:28:03', event: 'Channel point redeem', viewer: 'cat', amount: '-', ok: true, result: 'Twitch channel points: redeemed Open a pack' },
    { at: t0 + 2000, time: '19:28:02', event: 'Channel point redeem', viewer: 'cat', amount: '-', ok: false, result: 'Ignored: Twitch channel points: Open a pack failed for Open a pack: awards paused' },
    { at: t0 + 1000, time: '19:28:01', event: 'Stream online', viewer: '-', amount: '-', ok: true, result: 'The stream went online' },
  ], []);
  assert.deepEqual(filterFeed(tw, 'events').map(r => [r.badge, r.tag]), [['E', 'rewarded'], ['!', 'refused'], ['E', 'rewarded']], 'Twitch events are under Events');
  assert.match(tw[1].text, /awards paused$/);
  assert.equal(tw[2].text, 'Stream online: The stream went online');

  // The pull list keeps the newest 500.
  let held: PullEntry[] = [];
  for (let i = 0; i < PULLS_KEEP + 5; i++) held = keepPull(held, pull(i, 'x', 1));
  assert.equal(held.length, PULLS_KEEP);
  assert.equal(held[0].at, t0 + (PULLS_KEEP + 4) * 1000, 'newest first');

  // This stream: only what came after `since`.
  const ledger = [
    { id: '1', user: 'a', amount: -50, at: t0 + 1000, answer: 'ok' },
    { id: '2', user: 'a', amount: -30, at: t0 + 2000, answer: 'ok' },
    { id: '3', user: 'a', amount: -99, at: t0 + 3000, answer: 'Not enough' },
    { id: '4', user: 'a', amount: 100, at: t0 + 4000, answer: 'ok' },
    { id: '5', user: 'a', amount: -70, at: t0 - 5000, answer: 'ok' },
  ];
  const n = streamNumbers([pull(1, 'cy', 5), pull(2, 'cy', 1), pull(3, 'di', 4), pull(-10, 'old', 5)], ledger, t0);
  assert.deepEqual(n, { pulls: 3, big: 2, spent: 80, top: { viewer: 'cy', pulls: 2 } }, 'pulls, big pulls (4 stars and up), Brie Bucks taken and the top puller since the stream began');
  assert.deepEqual(streamNumbers([], [], t0), { pulls: 0, big: 0, spent: 0, top: null }, 'a quiet stream');

  // The Ready to go live card.
  const ok = { label: 'Site', tone: 'ok' as const, text: 'fine' };
  const red = { label: 'Pulls', tone: 'bad' as const, text: 'Pulls are paused.' };
  const grey = { label: 'Happy hour', tone: 'muted' as const, text: 'Not running.' };
  assert.deepEqual(readySummary(null), { done: false, text: 'Not run yet', lines: [] });
  assert.deepEqual(readySummary({ lines: [ok, ok, grey], ready: true, at: t0 }), { done: true, text: 'All 3 checks passed at 19:28', lines: [] }, 'passed: one line');
  assert.deepEqual(readySummary({ lines: [ok, red, grey], ready: false, at: t0 }), { done: false, text: '1 thing needs fixing (checked at 19:28)', lines: [red] }, 'failed: only the red lines');
  assert.equal(readySummary({ lines: [red, { ...red, label: 'Season' }], ready: false, at: t0 }).text, '2 things need fixing (checked at 19:28)');

  // The page: the dashboard's cards are on Home, the custom happy hour on Controls, the history for everyone.
  const html = readFileSync(join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const pageOf = (id: string): string => {
    const at = html.indexOf(` id="${id}"`);
    assert.ok(at >= 0, `#${id} is in index.html`);
    const before = [...html.slice(0, at).matchAll(/data-panel="([\w-]+)"/g)];
    return before[before.length - 1][1];
  };
  for (const id of ['chip-site', 'chip-mix', 'chip-obs', 'chip-deck', 'card-pulls', 'card-awards', 'card-happy', 'card-queue', 'card-numbers', 'card-feed', 'card-ready']) assert.equal(pageOf(id), 'home', `${id} is on Home`);
  assert.equal(pageOf('card-happy-custom'), 'controls', 'Custom... lands on the Controls page');
  assert.equal(pageOf('card-history'), 'feed');
  assert.ok(!/id="rail-feed"[^>]*hidden/.test(html) && !/data-tab="feed"[^>]*hidden/.test(html), 'Feed and history is in the sidebar for everyone');
  assert.ok(/<section[^>]*id="card-activity"[^>]*hidden/.test(html), 'the Activity part starts hidden (staff PCs only)');
  const js = readFileSync(join(__dirname, '..', 'renderer', 'renderer.js'), 'utf8');
  assert.ok(js.includes("'card-happy-custom'"), 'card-happy-custom is a jump target in renderer.js');
  assert.ok(js.includes('window.bridge.setPauseAwards(') && html.includes('id="control-awards"'), 'Pause channel point awards (58.5) is a button wired to the control path');
  assert.ok(readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8').includes("label: 'Pause channel point awards'"), 'and a tray item');
  for (const c of ['site', 'mix', 'obs', 'deck']) assert.ok(js.includes(`'chip-${c}'`), `the ${c} chip is wired in renderer.js`);
  for (const c of ['account', 'mix', 'obs', 'deck']) assert.equal(pageOf(`detail-${c}`), 'connections', `the ${c} connection is on Connections`);
  assert.ok(/class="feed-list"[^>]*aria-label="[^"]+"/.test(html) || /aria-label="[^"]+"[^>]*class="feed-list"/.test(html), 'the feed is a list with an accessible name');
  assert.ok(/aria-pressed="(true|false)"/.test(html), 'filter chips are buttons with aria-pressed');
}
