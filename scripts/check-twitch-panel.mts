// Checks the Twitch panel stays in step with the server: its serial-bonus maths (public/twitch-panel/panel.js has no build step, so it
// mirrors lib/scoring-core.ts) and that the three views (panel / mobile / video component) share the same markup.
// Pure. Run: npx tsx scripts/check-twitch-panel.mts
import { readFileSync } from 'node:fs';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { serialMultiplier } = await import('../lib/scoring-core');
const read = (f: string) => readFileSync(new URL(`../public/twitch-panel/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ── serial maths: run the panel's own functions against the server's ──
const js = read('panel.js');
const a = js.indexOf('// ── Serial numbers & points');
const b = js.indexOf('// The viewer\'s serial numbers for one card');
ok(a > 0 && b > a, 'found the serial maths in panel.js');
const make = new Function('me', 'VARIANTS', 'VARIANT_OFFSET', `${js.slice(a, b)}\nreturn { serialMult, copyPts, entryOf };`) as (me: unknown, v: string[], o: number) => {
  serialMult(n: number): number; copyPts(card: number, variant: string, serial?: number): number; entryOf(card: number, variant: string): number;
};
const VARIANTS = ['regular', 'reverse', 'full', 'shiny'];
for (const [max, cutoff] of [[3, 20], [5, 10], [1, 20], [3, 0], [2.5, 1]] as const) {
  const panel = make({ bonus: { max, cutoff }, cards: { 7: { values: [100, 600, 2000, 10000], raw: [100.4, 600.2, 2000.5, 10000.1] } } }, VARIANTS, 1_000_000);
  for (let n = 0; n <= 30; n++) {
    const want = serialMultiplier(n, { serialBonusMax: max, serialBonusCutoff: cutoff });
    ok(Math.abs(panel.serialMult(n) - want) < 1e-9, `serial multiplier for #${n} (max ${max}, cutoff ${cutoff}): ${panel.serialMult(n)} vs ${want}`);
  }
  // A copy past the bonus is worth the plain value; one inside it is the unrounded value times the multiplier.
  ok(panel.copyPts(7, 'regular', 999) === 100, 'no bonus past the cutoff');
  ok(panel.copyPts(7, 'regular', undefined) === 100, 'no serial, no bonus');
  const m = serialMultiplier(1, { serialBonusMax: max, serialBonusCutoff: cutoff });
  ok(panel.copyPts(7, 'shiny', 1) === (m === 1 ? 10000 : Math.max(1, Math.round(10000.1 * m))), 'bonus copy points use the unrounded value');
}
ok(make({ bonus: { max: 3, cutoff: 20 }, cards: {} }, VARIANTS, 1_000_000).entryOf(5, 'full') === 2_000_005, 'entry encoding matches lib/variants.ts');

// ── the three views share one markup ──
const body = (html: string) => html.replace(/<meta name="viewport"[^>]*>\n/, '').replace(/ *<link rel="stylesheet" href="views.css">\n/, '').replace(/<body class="[^"]*">\n(\n  <!--[^\n]*-->\n)?/, '<body>\n');
const base = body(read('panel.html'));
for (const f of ['mobile.html', 'video_component.html']) ok(body(read(f)) === base, `${f} has the same markup as panel.html (keep the three in sync)`);
for (const id of ['stats-area', 'trades-area', 'leaderboard-area', 'collection-area', 'grid-tools', 'pack-tabs', 'panel-banner', 'toast', 'trades-dot', 'view-tabs']) {
  ok(base.includes(`id="${id}"`), `panel.html has #${id}`);
  ok(js.includes(id), `panel.js uses #${id}`);
}
console.log('twitch panel checks passed');
