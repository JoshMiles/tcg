// The accessibility audit of the app's pages (ROADMAP 59.8), and the tool windows' tie to the Home feed's filters. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditHtml } from '../src/a11y';
import { FEED_FILTERS, mergeFeed } from '../src/home';

const dir = join(__dirname, '..', 'renderer');
const page = (name: string): string => readFileSync(join(dir, name), 'utf8');

export function a11yChecks(): void {
  // The audit itself: each rule fires on a bad page and stays quiet on a good one.
  const good = '<html lang="en"><head><title>T</title></head><body><h1>A</h1><h2>B</h2><button type="button">Go</button><button type="button" aria-label="Close"><svg></svg></button><label for="n">Name</label><input id="n"><input aria-label="Q"><img alt="" src="x"></body></html>';
  assert.deepEqual(auditHtml(good), [], 'a good page has no problems');
  assert.match(auditHtml(good.replace('>Go<', '><'))[0], /button has no text/, 'an empty button is caught');
  assert.match(auditHtml(good.replace(' aria-label="Close"', ''))[0], /button has no text/, 'an icon button with no aria-label is caught');
  assert.match(auditHtml(good.replace('<input aria-label="Q">', '<input>'))[0], /input has no label/, 'an unlabelled field is caught');
  assert.match(auditHtml(good.replace('<h2>B</h2>', '<h3>B</h3>'))[0], /jumps from h1 to h3/, 'a skipped heading level is caught');
  assert.match(auditHtml(good.replace('<h1>A</h1>', ''))[0], /no h1/, 'a page with no h1 is caught');
  assert.match(auditHtml(good.replace('<img alt="" ', '<img '))[0], /no alt/, 'an image with no alt is caught');
  assert.match(auditHtml(good.replace(' lang="en"', ''))[0], /no lang/, 'a missing language is caught');
  assert.deepEqual(auditHtml('<html lang="en"><title>T</title><h1>A</h1><button type="button" hidden>x</button><!-- <button></button> --><script>"<button></button>"</script>'), [], 'comments and scripts are not parsed as markup');

  // Every page of the app passes (index.html is one page with several panels, so its headings are checked in document order).
  for (const name of ['index.html', 'feed.html', 'summary.html', 'preview.html', 'splash.html']) {
    const found = auditHtml(page(name));
    assert.deepEqual(found, [], `${name}: ${found.join('; ')}`);
  }

  // The tool windows use the same style and the same stylesheet as the main window, with no colours of their own.
  for (const name of ['feed.html', 'summary.html', 'preview.html']) {
    const html = page(name);
    assert.match(html, /href="style\.css"/, `${name} shares style.css`);
    assert.match(html, /class="titlebar"/, `${name} has the main window's header`);
  }
  // The one literal colour is the preview stage's black, the OBS canvas behind the overlay.
  assert.doesNotMatch(page('tools.css').replace('background: #000', ''), /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tools.css holds layout only; colours come from the tokens in style.css');

  // The feed window offers exactly the Home feed's filters, in the same order and words.
  const chips = [...page('feed.html').matchAll(/<button\b[^>]*data-filter="([a-z]+)"[^>]*>([^<]*)<\/button>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(chips, FEED_FILTERS.map(f => [f.id, f.label]), 'feed.html lists the same filter chips as src/home.ts');

  // A pull row carries what the feed window shows beyond the common row: the image, the edition and the rarity.
  const rows = mergeFeed([{ at: 1, viewer: 'cy', card: 'Gouda Goat', rarity: 'Legendary', stars: 5, variant: 'Holo', serial: 7, image: 'https://x/y.png' }], [], []);
  assert.deepEqual(rows[0].pull, { card: 'Gouda Goat', rarity: 'Legendary', variant: 'Holo', serial: 7, image: 'https://x/y.png' });
  assert.equal(mergeFeed([{ at: 1, viewer: 'a', card: 'c', rarity: 'Common', stars: 1, variant: 'Regular' }], [], [])[0].pull?.serial, 0, 'a pull with no edition number shows 0, never undefined');
}
