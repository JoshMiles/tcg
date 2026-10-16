// The per-pack card back (ROADMAP 20.1): the sanitiser, "no key = today's look", the stored key and the share plate's look.
// Needs the mock KV (npm run check starts it); refuses anything non-local. Run: npx tsx scripts/check-card-back.mts
import { readFileSync } from 'node:fs';
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const cb = await import('../lib/card-back');
const store = await import('../lib/card-back-store');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');

// sanitizeCardBack: unknown keys dropped, colours validated, template capped.
const dirty = cb.sanitizeCardBack({
  evil: 1, background: 'plaid', bg1: 'red', bg2: '#ABC', angle: 725, pattern: 'holes', edge: 'url(x)', text: '#112233', accent: 'javascript:1',
  font: 'comic', align: 'top', logo: 'url', logoUrl: 'javascript:alert(1)', logoSize: 'XL', line: 'x'.repeat(200),
  show: { qr: false, history: 'no', bogus: true }, size: { number: 'L', qr: 'XXL' },
});
ok(!('evil' in dirty) && !('bogus' in dirty.show), 'unknown keys dropped');
ok(dirty.background === 'steel' && dirty.bg1 === cb.DEFAULT_CARD_BACK.bg1 && dirty.bg2 === '#aabbcc', 'bad background and colour fall back; short hex expands');
ok(dirty.angle === 5, 'angle wraps into 0..359');
ok(dirty.edge === 'rarity' && dirty.accent === 'auto' && dirty.text === '#112233', 'edge and accent colours validated, a good one kept');
ok(dirty.font === 'display' && dirty.align === 'top' && dirty.pattern === 'holes' && dirty.logoSize === 'M', 'choices validated');
ok(dirty.logo === 'none' && dirty.logoUrl === '', 'a bad logo address turns the logo off');
ok(dirty.line.length === cb.MAX_LINE, 'custom line capped at the maximum');
ok(dirty.show.qr === false && dirty.show.history === true && dirty.size.number === 'L' && dirty.size.qr === 'M', 'element switches and sizes validated');
ok(cb.sanitizeCardBack(null).line === '' && cb.sanitizeCardBack('x').pattern === 'lines', 'junk input gives the default');
ok(cb.sanitizeCardBack({ logo: 'url', logoUrl: 'https://cdn.example.com/a.png' }).logo === 'url', 'an https logo is kept');
ok(cb.sanitizeCardBack({ logoUrl: '/assets/x.png', logo: 'url' }).logoUrl === '/assets/x.png' && cb.sanitizeCardBack({ logoUrl: '//evil.com/x.png', logo: 'url' }).logo === 'none', 'site paths are kept, protocol-relative ones are not');
ok(cb.sanitizeCardBack({ cover: 'https://x/y.png', lineText: 'hi' }).cover === undefined, 'runtime-only fields are never stored');

// The template.
ok(cb.renderBackLine('From {pack} in {season}', { pack: 'Base', season: 'S1' }) === 'From Base in S1', 'template fills pack and season');
ok(cb.renderBackLine('{pack} {nope}', { pack: 'Base' }) === 'Base {nope}', 'unknown tokens are left alone');

// No design = today's look exactly.
ok(cb.isDefaultCardBack(cb.DEFAULT_CARD_BACK) && cb.isDefaultCardBack(cb.sanitizeCardBack({})), 'the default design is the default');
ok(!cb.isDefaultCardBack(cb.sanitizeCardBack({ pattern: 'none' })), 'a changed design is not the default');
ok(cb.resolveCardBack(null, { packName: 'P' }) === undefined, 'no stored design gives no style (the classic plate renders)');
const legacyBg = 'repeating-linear-gradient(90deg, rgba(255,255,255,.28) 0 1px, transparent 1px 3px), linear-gradient(135deg, #a9a9b3 0%, #dcdce3 36%, #9a9aa5 62%, #c4c4cd 100%)';
ok(cb.plateBackground(cb.DEFAULT_CARD_BACK) === legacyBg, "the default plate background is today's, layer for layer");
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\s+/g, ' ');
ok(css.includes(`var(--plate-bg, ${legacyBg}`), 'the stylesheet falls back to the classic plate when no variables are set');
const dv = cb.cardBackVars(cb.DEFAULT_CARD_BACK, '#123456');
ok(dv['--edge'] === '#123456' && dv['--plate-justify'] === 'center' && !('--ink' in dv) && !('--accent-ink' in dv) && Object.entries(dv).filter(([k]) => k.startsWith('--k-')).every(([, v]) => v === '1'), 'the default design changes no colour, size or position');
ok(cb.cardBackVars(cb.sanitizeCardBack({ edge: '#ff0000', size: { qr: 'L' }, align: 'bottom' }), '#123456')['--edge'] === '#ff0000', 'a fixed edge wins over the rarity colour');
ok(cb.plateLook(undefined) === undefined, 'no style: the share plate keeps the theme');
ok(cb.plateLook(cb.DEFAULT_CARD_BACK)?.stops === undefined && cb.plateLook(cb.DEFAULT_CARD_BACK)?.show.qr === true, "the default design leaves the share plate's metal alone");
const dark = cb.plateLook(cb.sanitizeCardBack({ background: 'solid', bg1: '#101018', show: { date: false } }));
ok(dark?.stops?.[0] === '#101018' && dark.dark === true && dark.show.date === false, 'a dark custom back gives a dark share plate');
ok(cb.PRESETS.length === 4 && cb.PRESETS.every(p => JSON.stringify(cb.sanitizeCardBack(p.style)) === JSON.stringify(p.style)), 'presets are valid designs');

// Storage: its own key, none for the default, removed with the pack.
const pack = { id: 'pk', name: 'Base', coverImageUrl: 'https://cdn.example.com/cover.png', active: true, status: 'published' as const, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1, soundVolume: 1, createdAt: 1, upgradesEnabled: false, variantWeights: { regular: 1, reverse: 0, full: 0, shiny: 0 }, upgradeCosts: { reverse: 1, full: 1, shiny: 1 } };
await kvLib.savePack(pack as never);
ok(await store.getCardBack('pk') === null && await store.cardBackFor(pack, 'S1') === undefined, 'no key: no design');
await store.saveCardBack('pk', { pattern: 'cover', line: 'Pack {pack} / {season}', logo: 'cover' });
ok(await kv.get('pack:pk:cardback') != null, 'stored in pack:<id>:cardback');
const got = await store.cardBackFor(pack, 'S1');
ok(got?.pattern === 'cover' && got.cover === pack.coverImageUrl && got.lineText === 'Pack Base / S1', 'the stored design comes back with the cover and the finished line');
await kvLib.savePack({ ...pack, name: 'Renamed' } as never);
ok((await store.getCardBack('pk'))?.pattern === 'cover', 'saving the pack does not touch the design');
await store.saveCardBack('pk', cb.DEFAULT_CARD_BACK);
ok(await kv.get('pack:pk:cardback') == null, 'saving the default design removes the key');
await store.saveCardBack('pk', { pattern: 'holes' });
await kvLib.deletePack('pk');
ok(await kv.get('pack:pk:cardback') == null, 'deleting the pack removes its design');

console.log('card back checks passed');
