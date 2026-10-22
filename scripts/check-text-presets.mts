// Text style presets (ROADMAP 38.12 e): sanitising on save and read, name limits, the cap, delete, built-ins.
// Needs the mock KV (the check runner starts it); refuses anything non-local. Run: npx tsx scripts/check-text-presets.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const tp = await import('../lib/text-presets');
const store = await import('../lib/text-presets-store');
const { kv } = await import('../lib/db');
await kv.del('textpresets');

ok(tp.BUILTIN_TEXT_PRESETS.length >= 4 && tp.BUILTIN_TEXT_PRESETS.every(p => p.id.startsWith('builtin:')), 'built-ins exist and have builtin ids');
const gold = tp.BUILTIN_TEXT_PRESETS[0].style;
ok(gold.fx.gradientText && gold.fx.shadows?.length === 1, 'a built-in keeps its effects through the sanitiser');

// Sanitised on save: junk fields dropped, values clamped, position and text never kept.
let list = await store.saveTextPreset('  Mine  ', { size: 999, font: 'nope', color: 'red', text: 'hello', x: 5, y: 5, w: 50, fx: { stroke: { color: '#112233', width: 99, pos: 'weird' } } });
ok(list.length === 1 && list[0].name === 'Mine', 'name trimmed');
const st = list[0].style as unknown as Record<string, unknown>;
ok(st.size === 30 && st.font === 'body' && st.color === 'auto', 'values sanitised');
ok(!('text' in st) && !('x' in st) && !('w' in st), 'text and position are not part of a preset');
ok(list[0].style.fx.stroke?.width === 10 && list[0].style.fx.stroke.pos === 'outside', 'effects sanitised');

// Sanitised on read: a hand-edited key cannot smuggle bad data.
await kv.set('textpresets', [{ id: 'a', name: 'ok', style: { size: -5, evil: 1 } }, { id: 'builtin:x', name: 'no', style: {} }, { id: 'b', name: '   ', style: {} }, 'junk', { id: 'a', name: 'dup', style: {} }]);
const read = await store.getTextPresets();
ok(read.length === 1 && read[0].id === 'a' && read[0].style.size === 2 && !('evil' in read[0].style), 'read drops bad rows, duplicates and builtin ids; clamps the style');

// Names: empty rejected, long cut to 40, the same name (any case) replaces.
await kv.del('textpresets');
let threw = false;
try { await store.saveTextPreset('   ', {}); } catch { threw = true; }
ok(threw, 'an empty name is rejected');
list = await store.saveTextPreset('x'.repeat(60), {});
ok(list[0].name.length === 40, 'name cut to 40');
list = await store.saveTextPreset('A', { size: 10 });
list = await store.saveTextPreset('a', { size: 20 });
ok(list.filter(p => p.name.toLowerCase() === 'a').length === 1 && list.find(p => p.name === 'a')?.style.size === 20, 'the same name replaces the preset');

// The cap.
await kv.del('textpresets');
for (let i = 0; i < tp.MAX_PRESETS; i++) await store.saveTextPreset(`p${i}`, {});
threw = false;
try { await store.saveTextPreset('one too many', {}); } catch { threw = true; }
ok(threw && (await store.getTextPresets()).length === tp.MAX_PRESETS, 'the list is capped at 50');
list = await store.saveTextPreset('p0', { size: 12 });
ok(list.length === tp.MAX_PRESETS, 'replacing by name still works at the cap');

// Delete, and built-ins cannot be deleted.
const id = list[0].id;
list = await store.deleteTextPreset(id);
ok(list.length === tp.MAX_PRESETS - 1 && !list.some(p => p.id === id), 'delete removes it');
const before = (await store.getTextPresets()).length;
await store.deleteTextPreset(tp.BUILTIN_TEXT_PRESETS[0].id);
ok((await store.getTextPresets()).length === before && tp.BUILTIN_TEXT_PRESETS.length >= 4, 'a built-in id deletes nothing');

// Applying: the patch covers every style key, clearing what the preset leaves unset.
const patch = tp.presetPatch(tp.BUILTIN_TEXT_PRESETS[1].style) as Record<string, unknown>;
ok(tp.TEXT_STYLE_KEYS.every(k => k in patch) && patch.fit === undefined && !('text' in patch) && !('x' in patch), 'the patch has every style key and no content or position');

await kv.del('textpresets');
console.log('text preset checks passed');
