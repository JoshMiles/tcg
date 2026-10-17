// The per-pack card back (ROADMAP 20.1): the sanitiser, "no key = today's look", the stored key and the share plate's look.
// Needs the mock KV (npm run check starts it); refuses anything non-local. Run: npx tsx scripts/check-card-back.mts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const cb = await import('../lib/card-back');
const v1 = await import('../lib/card-back-v1');
const lay = await import('../lib/card-back-layout');
const store = await import('../lib/card-back-store');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');

// sanitizeCardBack: unknown keys dropped, colours validated, template capped.
const dirty = v1.sanitizeV1({
  evil: 1, background: 'plaid', bg1: 'red', bg2: '#ABC', angle: 725, pattern: 'holes', edge: 'url(x)', text: '#112233', accent: 'javascript:1',
  font: 'comic', align: 'top', logo: 'url', logoUrl: 'javascript:alert(1)', logoSize: 'XL', line: 'x'.repeat(200),
  show: { qr: false, history: 'no', bogus: true }, size: { number: 'L', qr: 'XXL' },
});
ok(!('evil' in dirty) && !('bogus' in dirty.show), 'unknown keys dropped');
ok(dirty.background === 'steel' && dirty.bg1 === v1.DEFAULT_V1.bg1 && dirty.bg2 === '#aabbcc', 'bad background and colour fall back; short hex expands');
ok(dirty.angle === 5, 'angle wraps into 0..359');
ok(dirty.edge === 'rarity' && dirty.accent === 'auto' && dirty.text === '#112233', 'edge and accent colours validated, a good one kept');
ok(dirty.font === 'display' && dirty.align === 'top' && dirty.pattern === 'holes' && dirty.logoSize === 'M', 'choices validated');
ok(dirty.logo === 'none' && dirty.logoUrl === '', 'a bad logo address turns the logo off');
ok(dirty.line.length === v1.MAX_LINE, 'custom line capped at the maximum');
ok(dirty.show.qr === false && dirty.show.history === true && dirty.size.number === 'L' && dirty.size.qr === 'M', 'element switches and sizes validated');
ok(v1.sanitizeV1(null).line === '' && v1.sanitizeV1('x').pattern === 'lines', 'junk input gives the default');
ok(v1.sanitizeV1({ logo: 'url', logoUrl: 'https://cdn.example.com/a.png' }).logo === 'url', 'an https logo is kept');
ok(v1.sanitizeV1({ logoUrl: '/assets/x.png', logo: 'url' }).logoUrl === '/assets/x.png' && v1.sanitizeV1({ logoUrl: '//evil.com/x.png', logo: 'url' }).logo === 'none', 'site paths are kept, protocol-relative ones are not');
ok(v1.sanitizeV1({ cover: 'https://x/y.png', lineText: 'hi' }).cover === undefined, 'runtime-only fields are never stored');

// ── v2: the upgrade, the sanitiser, the layout engine ──
const PRINT = { n: 7, uid: 1023381, total: 12, variantLabel: 'Shiny Full Art', name: 'Gouda Goat', date: '12 OCT 2026', origin: 'Pulled live on stream', holder: '@alice', hex: '#a855f7', history: [{ text: 'Pulled by @alice', date: '12 OCT 2026' }], href: '/copy/s1/x', qrUrl: 'https://example.com/copy/s1/x' };
const SIZE = { w: 220, h: 330 };

// DEFAULT_CARD_BACK is today's plate; no key renders it too.
ok(cb.DEFAULT_CARD_BACK.v === 2 && cb.isDefaultCardBack(cb.DEFAULT_CARD_BACK) && cb.isDefaultCardBack(cb.sanitizeCardBack({})) && cb.isDefaultCardBack(cb.sanitizeCardBack(null)), 'the default design is the default, and junk input gives it');
ok(!cb.isDefaultCardBack(cb.sanitizeCardBack({ pattern: 'none' })), 'a changed design is not the default');
ok(cb.resolveCardBack(null, { packName: 'P' }) === undefined, 'no stored design gives no style (the classic plate renders)');
const kinds = (s: ReturnType<typeof cb.sanitizeCardBack>, p: Record<string, unknown> = PRINT, o = {}) => lay.layoutBack({ ...s, packName: 'Base', seasonName: 'S1' }, p as typeof PRINT, SIZE, o).map(n => n.kind).join();
ok(kinds(cb.DEFAULT_CARD_BACK) === 'brand,number,edition,name,date,origin,history,qr,link', 'the classic plate: site name, number, edition, name, date, origin, history, QR, link, in that order');
ok(kinds(cb.DEFAULT_CARD_BACK, { ...PRINT, uid: undefined, total: undefined, date: undefined, origin: undefined, holder: undefined, history: undefined, href: undefined, qrUrl: undefined }) === 'brand,number,name,qr,link', 'an empty print keeps the footer row but drops what is missing');
ok(kinds(cb.DEFAULT_CARD_BACK, PRINT, { compact: true }) === 'brand,number,edition,name,date,qr,link', 'a compact back hides origin and history, and the QR code has nothing to draw (the footer row stays)');

// Every v1 design renders as it did: the plate, the per-element colours, shadows, sizes and fonts equal the v1 variables.
const designs: [string, unknown][] = [
  ['default', {}], ['clean', v1.PRESETS_V1[1].style], ['gold', v1.PRESETS_V1[2].style], ['art', v1.PRESETS_V1[3].style],
  ['text only', { text: '#112233' }], ['accent only', { accent: '#ff00ff' }], ['mono big', { font: 'mono', size: { number: 'L', edition: 'S', name: 'L', date: 'S', origin: 'L', history: 'S', qr: 'L' } }],
  ['hidden', { show: { number: false, date: false, history: false, qr: false }, align: 'bottom' }], ['line + url logo', { line: 'Hello {pack}', logo: 'url', logoUrl: 'https://cdn.example.com/l.png', logoSize: 'L' }],
];
const nodesByDesign: Record<string, unknown> = {};
for (const [name, raw] of designs) {
  const old = v1.sanitizeV1(raw); old.cover = 'https://cdn.example.com/cover.png';
  const up = cb.upgradeCardBack(old); up.cover = old.cover; up.packName = 'Base'; up.seasonName = 'S1';
  const ov = v1.cardBackVars(old, PRINT.hex);
  const pv = cb.plateVars(up, PRINT.hex);
  ok(pv['--edge'] === ov['--edge'] && pv['--plate-bg'] === ov['--plate-bg'] && pv['--plate-justify'] === ov['--plate-justify'], `${name}: plate edge, background and position equal the v1 design's`);
  const nodes = lay.layoutBack(up, PRINT, SIZE);
  nodesByDesign[name] = nodes;
  for (const n of nodes) {
    const gold = n.cls.includes('gold');
    const isAccent = n.kind === 'brand' || n.kind === 'link';
    const inkNow = isAccent ? (n.vars['--accent-ink'] ?? n.vars['--ink']) : gold ? undefined : n.vars['--ink'];
    const inkOld = isAccent ? (ov['--accent-ink'] ?? ov['--ink']) : gold ? undefined : ov['--ink'];
    if (n.tag !== 'empty' && n.kind !== 'qr' && n.kind !== 'logo') {
      ok(inkNow === inkOld, `${name}: ${n.kind} ink equals the v1 design's`);
      ok(n.vars['--ink-shadow'] === ov['--ink-shadow'], `${name}: ${n.kind} shadow equals the v1 design's`);
    }
    if (n.tag !== 'empty' && ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr'].includes(n.kind)) ok((n.vars[`--k-${n.kind}`] ?? '1') === ov[`--k-${n.kind}`], `${name}: ${n.kind} size equals the v1 design's`);
    if (n.kind === 'number') ok((n.vars['--num-font'] ?? v1.FONT_VAR.display) === ov['--num-font'], `${name}: number font equals the v1 design's`);
    if (n.kind === 'logo') ok(n.vars['--logo-px'] === ov['--logo-px'], `${name}: logo size equals the v1 design's`);
    ok(n.mode === 'stack', `${name}: every upgraded element stays in the stack`);
  }
  const back = cb.toV1(up);
  ok(JSON.stringify(back) === JSON.stringify(v1.sanitizeV1({ ...old, cover: undefined })), `${name}: the 20.1 controls read back the same design`);
}
ok(cb.sanitizeCardBack(v1.PRESETS_V1[1].style).v === 2, 'a v1 design is accepted and always comes back as v2');
// The snapshot of the node lists (the default and the presets), so a change to the engine shows up as a diff.
const snapPath = new URL('./snapshots/card-back-nodes.json', import.meta.url);
const snap = JSON.stringify(nodesByDesign, null, 1);
if (process.env.UPDATE_SNAPSHOT || !existsSync(snapPath)) writeFileSync(snapPath, snap + '\n');
ok(readFileSync(snapPath, 'utf8').trim() === snap.trim(), 'the node lists of the default and the presets match the snapshot (UPDATE_SNAPSHOT=1 to refresh on purpose)');

// The stylesheet still falls back to the classic plate.
const legacyBg = 'repeating-linear-gradient(90deg, rgba(255,255,255,.28) 0 1px, transparent 1px 3px), linear-gradient(135deg, #a9a9b3 0%, #dcdce3 36%, #9a9aa5 62%, #c4c4cd 100%)';
ok(v1.plateBackground(v1.DEFAULT_V1) === legacyBg, "the default plate background is today's, layer for layer");
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\s+/g, ' ');
ok(css.includes(`var(--plate-bg, ${legacyBg}`), 'the stylesheet falls back to the classic plate when no variables are set');
ok(cb.plateLook(undefined) === undefined, 'no style: the share plate keeps the theme');
ok(cb.plateLook(cb.DEFAULT_CARD_BACK)?.stops === undefined && cb.plateLook(cb.DEFAULT_CARD_BACK)?.show.qr === true, "the default design leaves the share plate's metal alone");
const dark = cb.plateLook(cb.sanitizeCardBack({ background: 'solid', bg1: '#101018', show: { date: false } }));
ok(dark?.stops?.[0] === '#101018' && dark.dark === true && dark.show.date === false, 'a dark custom back gives a dark share plate');
ok(cb.PRESETS.length === 4 && cb.PRESETS.every(p => JSON.stringify(cb.sanitizeCardBack(p.style)) === JSON.stringify(p.style)), 'presets are valid v2 designs');

// v2 sanitising: clamps, fixed lists, caps.
const messy = cb.sanitizeCardBack({
  v: 2, background: 'plaid', edge: 'red', evil: 1,
  elements: [
    { kind: 'text', id: 'a b', text: '<b>' + 'x'.repeat(200), font: 'Comic Sans', weight: 123, size: 99, x: -5, y: 500, w: 1, rotate: 400, z: 99, opacity: 7, color: 'blue', place: 'free', letterSpacing: 99, lineHeight: 0,
      fx: { outline: { color: 'nope', width: 99 }, glow: { color: '#ABC', blur: 999, strength: 99 }, shadow: { x: 99, y: -99 }, gradientText: { from: 'x', to: '#fff', angle: 725 }, engrave: 'yes', junk: 1 } },
    { kind: 'bogus' }, { kind: 'number' }, { kind: 'number' }, { kind: 'logo', src: 'url', url: 'javascript:alert(1)' },
  ],
});
const t = messy.elements[0];
ok(messy.background === 'steel' && messy.edge === 'rarity' && !('evil' in messy), 'v2: bad background and edge fall back, unknown keys are dropped');
ok(messy.elements.map(e => e.kind).join() === 'text,number,logo', 'v2: unknown kinds and a second number are dropped');
ok(t.font === 'body' && t.weight === 400 && t.size === 30 && t.x === 0 && t.y === 100 && t.w === 10 && t.rotate === 45 && t.z === 50 && t.opacity === 1 && t.color === 'auto' && t.letterSpacing === 20 && t.lineHeight === 0.8, 'v2: unknown fonts, weights and colours fall back; every number is clamped');
ok(t.text.length === 80 && !t.text.includes('<'), 'v2: a text box is capped at 80 characters and carries no markup');
ok(t.fx.outline?.color === '#000000' && t.fx.outline.width === 10 && t.fx.glow?.color === '#aabbcc' && t.fx.glow.blur === 40 && t.fx.glow.strength === 3 && t.fx.shadow?.x === 20 && t.fx.shadow.y === -20 && t.fx.gradientText?.angle === 5 && t.fx.engrave === undefined && !('junk' in t.fx), 'v2: effects are clamped and validated');
ok(messy.elements[2].src === 'cover' && messy.elements[2].url === '', 'v2: a bad logo address is dropped');
const many = cb.sanitizeCardBack({ v: 2, elements: Array.from({ length: 40 }, (_, i) => ({ kind: 'text', text: `t${i}` })) });
ok(many.elements.length === 8 && many.elements.length <= cb.MAX_ELEMENTS, 'v2: at most 8 text boxes (and 24 elements)');
const big = cb.sanitizeCardBack({ v: 2, elements: [{ kind: 'text', text: 'x', fx: {} }], pad: 'y'.repeat(20000) });
ok(JSON.stringify(big).length < cb.MAX_BYTES, 'v2: stored JSON stays under 16 KB');
ok(cb.sanitizeCardBack({ v: 2, elements: [{ kind: 'text' }, { kind: 'text' }] }).elements.map(e => e.id).join() === 'text-0,text-1', 'v2: ids are made unique');

// Free placement and templates.
const free = cb.sanitizeCardBack({ v: 2, elements: [
  { kind: 'text', id: 't1', place: 'free', x: 50, y: 20, w: 80, size: 10, font: 'bangers', weight: 700, text: '{card} #{printNumber} of {pack} {nope}', color: 'rarity', fx: { outline: { color: '#000000', width: 4 } } },
  { kind: 'qr', id: 'q', place: 'free', x: 80, y: 85, w: 20, rotate: 10, dark: '#112233' },
  { kind: 'name', place: 'free', show: false }, { kind: 'date', place: 'free', z: -3 },
] });
const fn = lay.layoutBack({ ...free, packName: 'Base', seasonName: 'S1' }, PRINT, SIZE);
ok(fn.map(n => n.id).join() === 'date-3,t1,q', 'free nodes are in layer order, hidden ones left out');
const tn = fn.find(n => n.id === 't1')!;
ok(tn.text === 'Gouda Goat #1023381 of Base' && tn.css.fontSize === 22 && tn.css.left === 22 && tn.css.top === 66 && tn.css.width === 176 && tn.css.color === '#a855f7' && tn.css.fontFamily === "'BackBangers', cursive", 'a free text box: placeholders resolved (unknown dropped), placed in pixels of this card size, rarity colour, curated font');
ok(String(tn.css.WebkitTextStroke).endsWith(' #000000'), 'an outline becomes a text stroke');
const grad = lay.layoutBack({ ...cb.sanitizeCardBack({ v: 2, elements: [{ kind: 'text', place: 'free', text: 'hi', fx: { gradientText: { from: '#ff0000', to: '#0000ff', angle: 90 } } }] }), packName: 'Base' }, PRINT, SIZE)[0];
ok(String(grad.css.backgroundImage).includes('90deg') && grad.css.backgroundClip === 'text', 'gradient text becomes a clipped background');
const big2 = lay.layoutBack({ ...free, packName: 'Base' }, PRINT, { w: 440, h: 660 });
ok(big2.find(n => n.id === 't1')!.css.fontSize === 44 && big2.find(n => n.id === 't1')!.css.left === 44, 'the same design scales with the card size');
ok(lay.fontsNeeded(fn).map(f => `${f.id}:${f.weight}`).join() === 'bangers:700' && fn.find(n => n.id === 'q')!.dark === '#112233' && fn.find(n => n.id === 'q')!.css.width === 44, 'fonts needed are listed; the QR keeps its colour and width');
ok(lay.resolveTemplate('{pack} {season} {card} {version} {edition} {printNumber} {holder} {date}', PRINT, { ...free, packName: 'P', seasonName: 'S' }) === 'P S Gouda Goat Shiny Full Art 7 1023381 @alice 12 OCT 2026', 'every placeholder resolves');
ok(cb.BACK_FONTS.filter(f => f.files).every(f => Object.values(f.files!).every(file => existsSync(new URL(`../public/fonts/back/${file}`, import.meta.url)))), 'every curated font file is in public/fonts/back');
ok(readdirSync(new URL('../public/fonts/back/', import.meta.url)).filter(f => f.endsWith('.LICENSE.txt')).every(f => /SIL Open Font License/i.test(readFileSync(new URL(`../public/fonts/back/${f}`, import.meta.url), 'utf8'))), 'every font has a licence file and it is the OFL');

// Storage: its own key, none for the default, removed with the pack.
const pack = { id: 'pk', name: 'Base', coverImageUrl: 'https://cdn.example.com/cover.png', active: true, status: 'published' as const, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1, soundVolume: 1, createdAt: 1, upgradesEnabled: false, variantWeights: { regular: 1, reverse: 0, full: 0, shiny: 0 }, upgradeCosts: { reverse: 1, full: 1, shiny: 1 } };
await kvLib.savePack(pack as never);
ok(await store.getCardBack('pk') === null && await store.cardBackFor(pack, 'S1') === undefined, 'no key: no design');
await store.saveCardBack('pk', { pattern: 'cover', line: 'Pack {pack} / {season}', logo: 'cover' }); // a v1 design in, stored as v2
ok(await kv.get('pack:pk:cardback') != null, 'stored in pack:<id>:cardback');
const got = await store.cardBackFor(pack, 'S1');
ok(got?.v === 2 && got.pattern === 'cover' && got.cover === pack.coverImageUrl && got.packName === 'Base' && got.seasonName === 'S1' && got.elements.some(e => e.kind === 'text' && e.text === 'Pack {pack} / {season}'), 'the stored design is v2 and comes back with the cover and the names; the line is the first text box');
ok((await kv.get<{ v: number }>('pack:pk:cardback'))?.v === 2, 'what is stored is v2');
await kvLib.savePack({ ...pack, name: 'Renamed' } as never);
ok((await store.getCardBack('pk'))?.pattern === 'cover', 'saving the pack does not touch the design');
await store.saveCardBack('pk', cb.DEFAULT_CARD_BACK);
ok(await kv.get('pack:pk:cardback') == null, 'saving the default design removes the key');
await store.saveCardBack('pk', { pattern: 'holes' });
await kvLib.deletePack('pk');
ok(await kv.get('pack:pk:cardback') == null, 'deleting the pack removes its design');

console.log('card back checks passed');
