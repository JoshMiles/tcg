// Checks the Overlay Editor's server pieces: saved versions, live-refresh token, season looks, diff and performance helpers.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-overlay.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const settings = await import('../lib/overlay-settings');
const versions = await import('../lib/overlay-versions');
const diff = await import('../lib/overlay-diff');
const perf = await import('../lib/overlay-perf');
const { DEFAULT_PROPS, PROP_BY_KEY } = await import('../lib/overlay-props');
const { DEFAULT_LAYOUT, sanitizeLayout, alignOffsets, distributeOffsets, measureGaps, anchorOffset } = await import('../lib/overlay-layout');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const { runInSandbox, prodKv } = await import('../lib/db');

// ── Pure: per-layer text style (ROADMAP 38.8 b) ──
{
  const { sanitizeTextPatch, mergeTextPatch, textPatchCss } = await import('../lib/overlay-text-style');
  const { PROPS, sanitizePropValues, mergePropValues } = await import('../lib/overlay-props');
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const layerKeys = PROPS.filter(p => p.type === 'textStyle').map(p => p.key);
  ok(['reveal.labelStyle', 'reveal.gotStyle', 'collection.headingStyle', 'show.labelStyle', 'moment.firstEver.textStyle', 'moment.newCard.subTextStyle'].every(k => layerKeys.includes(k)), 'every text layer has a style key');
  ok(layerKeys.every(k => JSON.stringify(DEFAULT_PROPS[k]) === '{}'), 'a text style defaults to empty (today\'s look)');
  // sanitize: invalid and box-only fields are dropped, nothing is filled in.
  eq(sanitizeTextPatch(undefined), {}, 'no style is the empty patch');
  eq(sanitizeTextPatch({ weight: 123, size: 9, height: 40, arc: 30, maxLines: 2, plate: { color: '#fff' }, textCase: 'nope', align: 'justify', tracking: 'x' }), {}, 'invalid and box-only fields are dropped');
  eq(sanitizeTextPatch({ weight: 700, italic: false, textCase: 'upper', tracking: 50.4, fx: { stroke: { color: '#112233', width: 99 }, glow: {}, junk: 1 } }), { weight: 700, italic: false, textCase: 'upper', tracking: 50, fx: { stroke: { color: '#112233', width: 10 } } }, 'a patch keeps only the set, valid fields');
  // merge: field by field, effect by effect.
  const g = sanitizeTextPatch({ weight: 700, textCase: 'upper', fx: { stroke: { color: '#000000', width: 2, pos: 'outside' }, shadows: [{ color: '#000000', x: 0, y: 2, blur: 4 }] } });
  const packOnly = sanitizeTextPatch({ fx: { stroke: { color: '#ff0000' } } });
  const m = mergeTextPatch(g, packOnly);
  eq((m.fx!.stroke as Record<string, unknown>), { color: '#ff0000', width: 2, pos: 'outside' }, 'a pack overrides just the outline colour');
  ok(m.weight === 700 && m.textCase === 'upper' && Array.isArray(m.fx!.shadows), 'the rest of the global style stays');
  eq(mergePropValues({ 'reveal.labelStyle': g, 'reveal.labelSize': 20 }, { 'reveal.labelStyle': packOnly, 'reveal.labelSize': 30 })['reveal.labelStyle'], m, 'mergePropValues merges text styles field by field');
  eq(mergePropValues({ 'reveal.labelSize': 20 }, { 'reveal.labelSize': 30 })['reveal.labelSize'], 30, 'other values are replaced');
  // import / presets / versions use the same sanitiser.
  eq(sanitizePropValues({ 'reveal.labelStyle': { weight: 700, size: 9 }, 'reveal.gotStyle': {} }), { 'reveal.labelStyle': { weight: 700 } }, 'sanitizePropValues keeps a style and drops what is not text style (defaults are dropped)');
  const id = (await settings.savePreset('Styled', { 'reveal.labelStyle': g }))!;
  eq((await settings.listPresets()).find(p => p.id === id)?.props['reveal.labelStyle'], g, 'a preset round-trips a text style');
  await settings.deletePreset(id);
  // diff: one line per field.
  const lines = diff.diffProps('Global', { 'reveal.labelStyle': g }, { 'reveal.labelStyle': mergeTextPatch(g, sanitizeTextPatch({ fx: { stroke: { width: 3 } }, textCase: 'none' })) }, () => undefined);
  eq(lines.map(l => `${l.label}|${l.from}|${l.to}`).sort(), ['Label: outline width|2|3', 'Label: case|upper|none'].sort(), 'the diff names each changed field');
  // The widget's port gives the same CSS as the TS reference.
  const w = readFileSync('public/widget.js', 'utf8').replace(/\r\n/g, '\n');
  const src = /\/\/ TEXT-STYLE-START\n([\s\S]*?)\/\/ TEXT-STYLE-END/.exec(w)?.[1];
  ok(src, 'widget.js has the TEXT-STYLE block');
  const wCss = runInNewContext(src + '; ({ textPatchCss, mergeTextPatch })', {}) as { textPatchCss: typeof textPatchCss; mergeTextPatch: typeof mergeTextPatch };
  const cases = [
    {}, g, m,
    sanitizeTextPatch({ italic: true, underline: true, strike: true, overline: true, tracking: 80, wordSpacing: 40, lineHeight: 1.5, align: 'right', kerning: false, opacity: 0.5 }),
    sanitizeTextPatch({ textCase: 'smallcaps', fx: { glow: { color: '#00ffff', blur: 12, strength: 2 }, bevel: { style: 'raised', depth: 2 } } }),
    sanitizeTextPatch({ fx: { stroke: { pos: 'center', width: 4 }, shadows: [{ color: '#112233', x: 1, y: 3, blur: 5, opacity: 0.4 }, { color: '#000000', x: 0, y: 1, blur: 2 }] } }),
    sanitizeTextPatch({ fx: { gradientText: { from: '#ff0000', to: '#0000ff', angle: 90 }, stroke: { color: '#ffffff', width: 1 }, shadows: [{ color: '#000000', x: 0, y: 2, blur: 4 }] } }),
    sanitizeTextPatch({ fx: { glow: { on: false }, stroke: { on: false } } }),
  ];
  for (const [i, c] of cases.entries()) for (const px of [14, 26]) {
    const a = wCss.textPatchCss(JSON.parse(JSON.stringify(c)), px, [10, 20, 30]), b = textPatchCss(c, px, [10, 20, 30]);
    const norm = (o: Record<string, string>) => JSON.stringify(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
    ok(norm(a) === norm(b), `widget textPatchCss matches the TS one (case ${i}, ${px}px): ${norm(a)} vs ${norm(b)}`);
  }
  eq(textPatchCss({}, 14, [0, 0, 0]), {}, 'an empty style writes no CSS');
  ok(!('opacity' in textPatchCss(cases[3], 14, [1, 2, 3])) && !('filter' in textPatchCss(cases[6], 14, [1, 2, 3])), 'a style never sets opacity or filter');
  eq(wCss.mergeTextPatch(g, packOnly), m, 'the widget merge matches the TS one');
  // Highlight tokens (ROADMAP 38.10 a): sanitized, merged field by field, never CSS.
  eq(sanitizeTextPatch({ accent: { color: 'accent', bold: true } }), { accent: { color: 'accent', bold: true } }, 'accent keeps a pack-accent colour and bold');
  eq(sanitizeTextPatch({ accent: { color: '#FF0000', on: false, junk: 1 } }), { accent: { color: '#ff0000', on: false } }, 'accent keeps a hex and the switch');
  eq(sanitizeTextPatch({ accent: { on: true } }), { accent: { on: true } }, 'accent switched on alone survives (the Highlight tokens switch writes on: true)');
  eq(sanitizeTextPatch({ accent: { color: 'red', bold: 'yes' } }), {}, 'a bad accent is dropped');
  const accA = sanitizeTextPatch({ weight: 700, accent: { color: '#ff0000', bold: true } }), accB = sanitizeTextPatch({ accent: { color: 'accent' } });
  eq(mergeTextPatch(accA, accB), { weight: 700, accent: { color: 'accent', bold: true } }, 'accent merges field by field');
  eq(wCss.mergeTextPatch(JSON.parse(JSON.stringify(accA)), accB), mergeTextPatch(accA, accB), 'the widget merges accent the same way');
  eq(textPatchCss(accB, 14, [0, 0, 0]), {}, 'accent writes no CSS');
  // The Character panel's edits (ROADMAP 38.8 c): only touched fields are stored, inherited ones are shown.
  {
    const { shownTextStyle, editTextPatch, clearTextPatch, patchFromStyle } = await import('../lib/overlay-text-style');
    const { BUILTIN_TEXT_PRESETS } = await import('../lib/text-presets');
    const shown = shownTextStyle(g, {});
    ok(shown.weight === 700 && shown.textCase === 'upper' && shown.fx.stroke?.width === 2, 'the panel shows the inherited style');
    // A pack changes only the outline colour: the panel reports the whole stroke, the patch keeps one field.
    const own1 = editTextPatch({}, shown, { fx: { ...shown.fx, stroke: { ...shown.fx.stroke!, color: '#ff0000' } } });
    eq(own1, { fx: { stroke: { color: '#ff0000' } } }, 'an edit stores only the changed field');
    const shown2 = shownTextStyle(g, own1);
    eq(shown2.fx.stroke, { color: '#ff0000', width: 2, pos: 'outside' }, 'inherited fields still show under the override');
    eq(editTextPatch(own1, shown2, { weight: 500 }), { weight: 500, fx: { stroke: { color: '#ff0000' } } }, 'a flat field is added to the patch');
    eq(clearTextPatch({ weight: 500, fx: { stroke: { color: '#ff0000' } } }, 'fx.stroke.color'), { weight: 500 }, 'clearing the last effect field drops the effect');
    eq(clearTextPatch({ weight: 500 }, 'weight'), {}, 'clearing a field makes it inherited');
    // Switching an inherited effect off writes on:false, switching it back on writes on:true; removing the effect clears the override.
    const off = editTextPatch({}, shown, { fx: { ...shown.fx, stroke: { ...shown.fx.stroke!, on: false } } });
    eq(off, { fx: { stroke: { on: false } } }, 'switching an inherited effect off stores on:false');
    ok(shownTextStyle(g, off).fx.stroke?.on === false, 'and the shown style has it off');
    eq(editTextPatch(off, shownTextStyle(g, off), { fx: { ...shownTextStyle(g, off).fx, stroke: { ...shownTextStyle(g, off).fx.stroke!, on: undefined } } }), { fx: { stroke: { on: true } } }, 'switching it back on stores on:true');
    eq(editTextPatch(own1, shown2, { fx: { ...shown2.fx, stroke: undefined } }), {}, 'removing the effect clears the override');
    ok(textPatchCss(mergeTextPatch(g, off), 14).WebkitTextStroke === undefined, 'an effect switched off here is off in the CSS');
    // Presets become a patch of only what they set.
    const outlined = patchFromStyle(BUILTIN_TEXT_PRESETS.find(p => p.id === 'builtin:outlined-label')!.style);
    ok(outlined.textCase === 'upper' && outlined.weight === 700 && (outlined.fx?.stroke as { width: number }).width === 3 && !('size' in outlined), 'a preset becomes a style patch');
    eq(patchFromStyle(shownTextStyle(undefined, {})), {}, 'a plain style is the empty patch');
  }
}


// ── Pure: special moments (ROADMAP 18.1) ──
{
  const { pickMoment, MOMENT_IDS } = await import('../lib/overlay-moments');
  const { PROPS, MOMENT_BANNER_DEFAULT_BG } = await import('../lib/overlay-props');
  // Defaults reproduce today's overlay: the first-ever banner is on with its old text / hold / look, the new moments are off.
  ok(DEFAULT_PROPS['reveal.firstEver'] === true && DEFAULT_PROPS['reveal.firstEverText'] === 'FIRST EVER!' && DEFAULT_PROPS['reveal.firstEverHold'] === 2.5, 'first-ever keeps its old defaults');
  eq(DEFAULT_PROPS['moment.firstEver.bgColors'], MOMENT_BANNER_DEFAULT_BG, 'first-ever banner colours are the old gold');
  ok(DEFAULT_PROPS['moment.firstEver.textColor'] === '#1a1205' && DEFAULT_PROPS['moment.firstEver.textSize'] === 26 && DEFAULT_PROPS['moment.firstEver.position'] === 'top' && DEFAULT_PROPS['moment.firstEver.sparkles'] === 44 && DEFAULT_PROPS['moment.firstEver.sound'] === '' && DEFAULT_PROPS['moment.firstEver.style'] === 'inherit', 'first-ever look defaults match the old banner');
  ok(DEFAULT_PROPS['moment.firstPull.on'] === false && DEFAULT_PROPS['moment.newCard.on'] === false, 'first pull and new card moments are off by default');
  ok(DEFAULT_PROPS['moment.firstPull.text'] === 'Welcome, {username}!', 'first-pull banner text default');
  ok(PROPS.filter(d => d.group === 'moments').length >= 36 && PROPS.every(d => d.group !== 'pack' || !/firstEver/.test(d.key)), 'the moment keys live in the moments group');
  ok(new Set(PROPS.filter(d => d.group === 'moments').map(d => d.section)).size === 3, 'three sections');
  // Priority: one moment per pull, the highest wins.
  const on = { firstEver: true, firstPull: true, newCard: true };
  const off = { firstEver: false, firstPull: false, newCard: false };
  ok(pickMoment({ firstEver: true, firstForViewer: true, isNew: true }, on) === 'firstEver', 'first-ever beats first pull and new card');
  ok(pickMoment({ firstForViewer: true, isNew: true }, on) === 'firstPull', 'first pull beats new card');
  ok(pickMoment({ isNew: true }, on) === 'newCard', 'new card alone');
  ok(pickMoment({ firstEver: true, firstForViewer: true, isNew: true }, { ...on, firstEver: false }) === 'firstPull', 'a disabled moment falls through to the next');
  ok(pickMoment({ firstEver: true, firstForViewer: true, isNew: true }, off) === null && pickMoment({}, on) === null, 'nothing when off or nothing happened');
  // The widget mirrors the helper: run its copy over every combination.
  const { readFileSync } = await import('node:fs');
  const w = readFileSync('public/widget.js', 'utf8');
  const fn = w.match(/function pickMoment\(facts, enabled\) \{[\s\S]*?\r?\n\}/)![0];
  const widgetPick = new Function(fn + '; return pickMoment;')() as typeof pickMoment;
  let same = true;
  for (let m = 0; m < 64; m++) {
    const f = { firstEver: !!(m & 1), firstForViewer: !!(m & 2), isNew: !!(m & 4) };
    const e = { firstEver: !!(m & 8), firstPull: !!(m & 16), newCard: !!(m & 32) };
    if (widgetPick(f, e) !== pickMoment(f, e)) same = false;
  }
  ok(same, 'widget.js pickMoment agrees with lib/overlay-moments.ts');
  ok(MOMENT_IDS.every(id => w.includes("'" + id + "'")), 'widget knows every moment id');
}

// ── Pure: Show off group (ROADMAP 18.2) ──
{
  const { PROPS } = await import('../lib/overlay-props');
  ok(DEFAULT_PROPS['show.style'] === 'drop' && DEFAULT_PROPS['show.hold'] === 6 && DEFAULT_PROPS['show.text'] === '{user} is showing off:', 'show-off keeps its old defaults');
  ok(DEFAULT_PROPS['show.showLabel'] === true && DEFAULT_PROPS['show.ownLabelLook'] === false && DEFAULT_PROPS['show.labelSize'] === 14 && DEFAULT_PROPS['show.labelX'] === 0 && DEFAULT_PROPS['show.labelY'] === 0, 'label defaults follow the "got:" pill');
  ok(DEFAULT_PROPS['show.showPrint'] === true && DEFAULT_PROPS['show.printFormat'] === 'inherit' && DEFAULT_PROPS['show.cardScale'] === 1 && DEFAULT_PROPS['show.glow'] === 'inherit' && DEFAULT_PROPS['show.sparkles'] === 'inherit', 'print, size and effects follow the pack opening');
  ok(DEFAULT_PROPS['show.sound'] === 'on' && DEFAULT_PROPS['show.soundUrl'] === '' && DEFAULT_PROPS['show.volume'] === 1, 'the card sound plays as before');
  ok(PROPS.filter(d => d.key.startsWith('show.')).every(d => d.group === 'showoff'), 'every show.* key is in the Show off group');
  eq([...new Set(PROPS.filter(d => d.group === 'showoff').map(d => d.section))], ['Entrance and timing', 'Label', 'Edition number', 'Card and effects', 'Sound'], 'five sections');
  ok(PROP_BY_KEY['show.style'].options!.every(o => !['classic', 'rip-shake', 'rip-peel', 'rip-slice', 'rip-explode'].includes(o.value)), 'entrances are the pack-less styles only');
}

// ── Pure: Golden variant overlay defaults and holo/glow/rock resolution (ROADMAP 29.4) ──
{
  const { buildHoloSpecs, holoClass } = await import('../lib/holo-core');
  ok(DEFAULT_PROPS['variant.golden.labelText'] === 'Golden', 'golden label text default');
  eq(DEFAULT_PROPS['variant.golden.labelColors'], ['#fbbf24', '#f59e0b', '#d97706'], 'golden label colors');
  eq(DEFAULT_PROPS['variant.golden.holoColors'], ['#ffb703', '#ffe14d', '#fff6c2'], 'golden shimmer colors');
  ok(DEFAULT_PROPS['variant.golden.holoSpeed'] === 14, 'golden shimmer sweep time 14s');
  ok(DEFAULT_PROPS['variant.golden.holoLoop'] === true, 'golden shimmer loop on');
  ok(DEFAULT_PROPS['variant.golden.glow'] === true && DEFAULT_PROPS['variant.golden.rock'] === true, 'golden glow and rock enabled');
  ok(DEFAULT_PROPS['variant.golden.sparkles'] === true, 'golden sparkles enabled');
  ok(DEFAULT_PROPS['variant.golden.sparkleCount'] === 32, 'golden sparkle amount 32');
  ok(DEFAULT_PROPS['variant.golden.sparkleColor'] === '#ffe14d', 'golden sparkle colour #ffe14d');
  ok(DEFAULT_PROPS['variant.golden.burstColor'] === '#f59e0b', 'golden burst color #f59e0b');

  // Verify buildHoloSpecs resolves glow and rock custom properties
  const specs = buildHoloSpecs(DEFAULT_PROPS, 1, 3);
  ok(specs.golden.on === true, 'golden holo spec is on');
  ok(specs.golden.style['--holo-time'] === '14s', 'golden holo time in style');
  ok(specs.golden.style['--glow-color-a'] === '#fde047', 'golden glow color in style');
  ok(specs.golden.style['--rock-amt'] === '2deg' && specs.golden.style['--rock-speed'] === '3.4s', 'golden rock vars in style');

  // Pack override resolution
  const packOverrides = { ...DEFAULT_PROPS, 'variant.golden.rockAmount': 4, 'variant.golden.glowColorA': '#ffffff', 'variant.reverse.glow': true, 'variant.reverse.glowColorA': '#a855f7' };
  const overridden = buildHoloSpecs(packOverrides, 1, 3);
  ok(overridden.golden.style['--rock-amt'] === '4deg', 'pack override rock amount applied');
  ok(overridden.golden.style['--glow-color-a'] === '#ffffff', 'pack override glow color applied');
  ok(overridden.reverse.style['--glow-color-a'] === '#a855f7', 'pack override reverse glow enabled');

  // Disabling glow or rock removes the custom property
  const disabledProps = { ...DEFAULT_PROPS, 'variant.golden.rock': false, 'variant.golden.glow': false };
  const shimmerOff = buildHoloSpecs({ ...DEFAULT_PROPS, 'variant.full.holoMode': 'off', 'variant.full.glow': true }, 1, 3);
  ok(shimmerOff.full.on && holoClass(shimmerOff.full) === '', 'shimmer off with glow on adds no holo class');
  const disabledSpecs = buildHoloSpecs(disabledProps, 1, 3);
  ok(disabledSpecs.golden.style['--rock-amt'] === undefined, 'disabled rock omits --rock-amt');
  ok(disabledSpecs.golden.style['--glow-color-a'] === undefined, 'disabled glow omits --glow-color-a');
}

// ── Pure: overlay text fonts (ROADMAP 28.4) ──
{
  const { FONT_IDS } = await import('../lib/card-back');
  const { PROPS, sanitizePropValues } = await import('../lib/overlay-props');
  const { overlayFontCatalog } = await import('../lib/card-back-overlay');
  const { readFileSync } = await import('node:fs');
  const layerKeys = PROPS.filter(p => /Font$|^moment\.\w+\.font$/.test(p.key)).map(p => p.key);
  ok(layerKeys.length === 12 && ['reveal.labelFont', 'show.labelFont', 'moment.firstEver.font', 'reveal.gotFont', 'collection.headingFont'].every(k => layerKeys.includes(k)), 'every text layer has a font key');
  ok(DEFAULT_PROPS['text.font'] === 'display', 'the overlay font defaults to site display');
  ok(layerKeys.every(k => DEFAULT_PROPS[k] === 'inherit'), 'text layer fonts default to the overlay font');
  ok(layerKeys.every(k => {
    const opts = (PROP_BY_KEY[k].options ?? []).map(o => o.value);
    return opts.length === FONT_IDS.length + 1 && opts[0] === 'inherit' && FONT_IDS.every((id, i) => opts[i + 1] === id);
  }), 'layer font selects are the overlay font plus the card-back faces');
  ok(PROP_BY_KEY['text.font'].options?.map(o => o.value).join() === FONT_IDS.join(), 'overlay font select is the card-back faces');
  ok(sanitizePropValues({ 'reveal.labelFont': 'inherit', 'show.labelFont': 'display', 'text.font': 'inherit' })['show.labelFont'] === 'display', 'saved display still valid; inherit is the default and drops');
  const fonts = overlayFontCatalog();
  const fredoka = fonts.find(f => f.id === 'fredoka');
  ok(fredoka?.file === 'fredoka-var.woff2' && fredoka.family === 'BackFredoka' && fredoka.weight === 700, 'catalog prefers the 700 weight (a variable font has one file)');
  ok(!fonts.find(f => f.id === 'display')?.file && fonts.find(f => f.id === 'bebas')?.file === 'bebas-neue-400.woff2', 'site display has no file; a 400-only face uses that file');
  const w = readFileSync('public/widget.js', 'utf8');
  ok(w.includes("id === 'display'") && w.includes('text.font') && layerKeys.every(k => w.includes("'" + k + "'") || k.startsWith('moment.')), 'display leaves the stylesheet font; every layer key is read by the widget');
}

// ── Pure: perf ──
const base = (over: Record<string, unknown> = {}) => (k: string) => (over[k] !== undefined ? over[k] : DEFAULT_PROPS[k]) as never;
const light = perf.variantPerf(base({ 'variant.regular.glow': false, 'variant.regular.rock': false, 'variant.regular.pop': false, 'variant.regular.holoMode': 'off', 'variant.regular.burst': false }), 'regular');
ok(light.level === 'light', 'a plain version is light');
const heavy = perf.variantPerf(base({ 'variant.shiny.glow': true, 'variant.shiny.glowBlur': 180, 'variant.shiny.sparkles': true, 'variant.shiny.sparkleCount': 80, 'variant.shiny.burst': true, 'variant.shiny.burstRays': 24, 'variant.shiny.burstHue': true, 'variant.shiny.tilt': true, 'variant.shiny.holoMode': 'on', 'variant.shiny.holoLoop': true }), 'shiny');
ok(heavy.level === 'heavy' && heavy.reasons.length >= 3, 'a maxed-out version is heavy with reasons');

// ── Pure: diff ──
const d = diff.diffProps('Everything', {}, { 'variant.shiny.glow': false }, k => PROP_BY_KEY[k]?.default);
ok(d.length === 1 && d[0].to === 'off' && d[0].from === 'on', 'diff shows a switched-off glow');
eq(diff.diffProps('x', { 'variant.shiny.glow': false }, { 'variant.shiny.glow': false }, () => undefined), [], 'identical values do not differ');
const lay = diff.diffLayout(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, width: 1920, pack: { ...DEFAULT_LAYOUT.pack, offsetX: 40 } });
ok(lay.length === 2, 'layout diff lists size and offset');
const lookA = { layout: DEFAULT_LAYOUT, props: {}, packs: {} };
const lookB = { layout: { ...DEFAULT_LAYOUT, width: 1920 }, props: { 'variant.shiny.glow': false }, packs: { p1: { 'variant.shiny.glow': false } } };
const looks = diff.diffLooks(lookA, lookB, id => 'Pack ' + id);
ok(looks.some(l => l.scope === 'Layout') && looks.some(l => l.scope === 'Everything') && looks.some(l => l.scope === 'Pack: Pack p1'), 'diffLooks covers layout, global values and a pack override');
eq(diff.diffLooks(lookA, lookA, String), [], 'diffLooks of a look with itself is empty');
// element layers
eq(sanitizeLayout({ width: 1280, height: 720, pack: { scale: 1, offsetX: 5, offsetY: 0 } }).pack, { scale: 1, offsetX: 5, offsetY: 0 }, 'an old layout reads back with no elements');
const el = sanitizeLayout({ pack: { elements: { label: { offsetX: 12.4, offsetY: -3 }, bar: { scale: 1, offsetX: 0, offsetY: 0 }, heading: { offsetX: 9 }, nope: { offsetX: 9 }, got: { scale: 9, offsetX: 99999, offsetY: 0 } } }, collection: { elements: { heading: { offsetY: 4 }, card: { offsetX: 1 } } } });
eq(el.pack.elements, { label: { scale: 1, offsetX: 12, offsetY: -3 }, got: { scale: 3, offsetX: 1280, offsetY: 0 } }, 'unknown and wrong-view ids are dropped, defaults omitted, values clamped');
eq(el.collection.elements, { heading: { scale: 1, offsetX: 0, offsetY: 4 } }, 'the collection view keeps only its own parts');
ok(diff.diffLayout(DEFAULT_LAYOUT, el).some(l => l.label.includes('label')), 'layout diff lists a moved element');
const op = sanitizeLayout({ pack: { elements: { label: { opacity: 0.6 }, bar: { opacity: 1 }, got: { opacity: 7 }, strip: { opacity: -2 }, serial: { opacity: 'x', offsetX: 3 }, card: { opacity: 0.456 } } } }).pack.elements;
eq(op, { card: { scale: 1, offsetX: 0, offsetY: 0, opacity: 0.46 }, label: { scale: 1, offsetX: 0, offsetY: 0, opacity: 0.6 }, serial: { scale: 1, offsetX: 3, offsetY: 0 }, strip: { scale: 1, offsetX: 0, offsetY: 0, opacity: 0 } }, 'opacity is clamped to 0..1 and omitted at 1 or when invalid');
ok(diff.diffLayout(DEFAULT_LAYOUT, sanitizeLayout({ pack: { elements: { label: { opacity: 0.6 } } } })).some(l => l.label === 'Pack opening label opacity' && l.from === '100%' && l.to === '60%'), 'layout diff lists an opacity change');
eq(sanitizeLayout({ pack: { elements: { banner: { offsetX: 12, scale: 1.5 } } } }).pack.elements?.banner, { scale: 1.5, offsetX: 12, offsetY: 0 }, 'the moment banner is a movable part');
// Custom layers (ROADMAP 38.7 a): each kind's sanitize, unknown kinds dropped, the 16 cap, bad image urls, absent custom unchanged.
{
  const cu = await import('../lib/overlay-custom');
  const { readFileSync } = await import('node:fs');
  const box = { x: 10, y: 20, w: 300, h: 80 };
  const lay = (custom: unknown) => sanitizeLayout({ pack: { custom } }).pack.custom;
  ok(sanitizeLayout({ pack: { scale: 1 } }).pack.custom === undefined && !('custom' in sanitizeLayout({}).collection) && !('custom' in DEFAULT_LAYOUT.pack), 'a layout with no custom layers has no custom key (today\'s look)');
  eq(sanitizeLayout({ pack: { custom: [] } }).pack, DEFAULT_LAYOUT.pack, 'an empty custom list reads back as none');
  const t = lay([{ id: 't1', kind: 'text', ...box, text: '**Hi** {user}', size: 9999, color: 'nope', font: 'Bad Font!', style: { weight: 700, bogus: 1 }, opacity: 3, rotate: 999 }])?.[0] as import('../lib/overlay-custom').CustomText;
  ok(t.kind === 'text' && t.text === '**Hi** {user}' && t.size === 400 && t.color === '#ffffff' && t.font === 'inherit' && t.opacity === 1 && t.rotate === 360 && t.visible === true && t.name === 'Text', 'a text layer is clamped and defaulted');
  eq(t.style, { weight: 700 }, 'a text layer keeps a valid text patch only');
  const i = lay([{ id: 'i1', kind: 'image', ...box, url: '/logo.png', fit: 'weird' }])?.[0] as import('../lib/overlay-custom').CustomImage;
  ok(i.kind === 'image' && i.url === '/logo.png' && i.fit === 'contain', 'an image layer keeps a same-site url, a bad fit falls back');
  const ix = lay([{ id: 'i5', kind: 'image', ...box, url: '/logo.png', radius: 99999, fx: { shadows: [{ color: '#000000', x: 1, y: 2, blur: 3 }], glow: { color: '#ffffff', blur: 5, strength: 1 }, stroke: { color: '#ff0000', width: 3, pos: 'center' }, bevel: { style: 'raised', depth: 1 } } }])?.[0] as import('../lib/overlay-custom').CustomImage;
  ok(ix.radius === 1000 && !!ix.fx.shadows && !!ix.fx.glow && ix.fx.stroke?.width === 3 && !('bevel' in ix.fx), 'an image layer clamps its radius and keeps shadow, glow and stroke only');
  ok(i.radius === 0 && Object.keys(i.fx).length === 0, 'an image layer with no radius or effects reads as today');
  ok(lay([{ id: 'i2', kind: 'image', ...box, url: 'https://abc.public.blob.vercel-storage.com/x.png' }])?.length === 1, 'a Blob image url is accepted');
  ok(lay([{ id: 'i3', kind: 'image', ...box, url: '' }])?.length === 1, 'an image with no url yet is kept');
  for (const bad of ['javascript:alert(1)', 'https://evil.example/x.png', '//evil.example/x.png', 'data:image/png;base64,AAAA', 'http://x.public.blob.vercel-storage.com/x.png', '/a b']) ok(lay([{ id: 'i4', kind: 'image', ...box, url: bad }]) === undefined, 'a bad image url drops the layer: ' + bad);
  const sh = lay([{ id: 's1', kind: 'shape', ...box, shape: 'star', sides: 99, inner: 5, fill: { type: 'gradient', kind: 'radial', stops: [{ color: '#ff0000', at: 0 }] }, stroke: { color: '#00ff00', width: 4, dash: 2 }, fx: { shadows: [{ color: '#000000', x: 1, y: 2, blur: 3 }], glow: { color: '#ffffff', blur: 5, strength: 1 }, bevel: { style: 'raised', depth: 1 } } }])?.[0] as import('../lib/overlay-custom').CustomShape;
  ok(sh.kind === 'shape' && sh.shape === 'star' && sh.sides === 12 && sh.inner === 0.9 && sh.fill.type === 'gradient' && sh.fill.stops.length === 2 && sh.stroke.width === 4 && !!sh.fx.shadows && !!sh.fx.glow && !('bevel' in sh.fx), 'a shape layer is clamped; only shadow and glow effects are kept');
  eq((lay([{ id: 's2', kind: 'shape', ...box, shape: 'blob', fill: { type: 'x' } }])?.[0] as import('../lib/overlay-custom').CustomShape).fill, { type: 'none' }, 'an unknown shape and fill fall back');
  // 38.7 c: today's look is the default for every new field; bad values fall back.
  const sd = lay([{ id: 's3', kind: 'shape', ...box, shape: 'rect' }])?.[0] as import('../lib/overlay-custom').CustomShape;
  ok(sd.radii.length === 0 && sd.cap === 'round' && sd.arrows === 'none' && sd.stroke.pos === 'inside', 'a shape with none of the 38.7 c fields reads as today (linked corners, round caps, no arrows, inside stroke)');
  const s4 = lay([{ id: 's4', kind: 'shape', ...box, radii: [1, 2, 3, 99999], cap: 'x', arrows: 'both', stroke: { pos: 'outside', width: 2 } }])?.[0] as import('../lib/overlay-custom').CustomShape;
  ok(s4.radii.join() === '1,2,3,1000' && s4.cap === 'round' && s4.arrows === 'both' && s4.stroke.pos === 'outside', 'per-corner radii are clamped, arrows and stroke position are kept, a bad cap falls back');
  ok((lay([{ id: 's5', kind: 'shape', ...box, radii: [1, 2], stroke: { pos: 'weird' } }])?.[0] as import('../lib/overlay-custom').CustomShape).radii.length === 0, 'radii that are not four numbers read as linked');
  ok(lay([{ id: 'a', kind: 'video', ...box }, { id: 'b', kind: 'text', ...box }, null, 'x', { kind: 'text' }, { id: 'a a', kind: 'text' }, { id: 'b', kind: 'text', ...box }])?.map(l => l.id).join() === 'b', 'unknown kinds, bad ids, non-objects and duplicate ids are dropped');
  ok(lay(Array.from({ length: 30 }, (_, n) => ({ id: 'c' + n, kind: 'text', ...box })))?.length === cu.MAX_CUSTOM && cu.MAX_CUSTOM === 16, 'at most 16 layers per view');
  const both = sanitizeLayout({ pack: { custom: [{ id: 'p', kind: 'text', ...box }] }, collection: { custom: [{ id: 'q', kind: 'text', ...box }] } });
  ok(both.pack.custom?.[0].id === 'p' && both.collection.custom?.[0].id === 'q', 'each view keeps its own layers');
  // 38.7 e: band, Show when, fades; defaults are today's look, bad values fall back, stepping stays inside a band.
  const bd = lay([{ id: 'b1', kind: 'text', ...box }, { id: 'b2', kind: 'text', ...box, band: 'back', show: 'after', fadeIn: 99999, fadeOut: -5 }, { id: 'b3', kind: 'text', ...box, band: 'x', show: 'x', fadeIn: 250 }]) as import('../lib/overlay-custom').CustomLayer[];
  ok(bd[0].band === 'front' && bd[0].show === 'always' && bd[0].fadeIn === 0 && bd[0].fadeOut === 0, 'a layer with no band / show / fades reads as front, always, no fade');
  ok(bd[1].band === 'back' && bd[1].show === 'after' && bd[1].fadeIn === 5000 && bd[1].fadeOut === 0, 'band and show are kept, fades are clamped to 0..5000 ms');
  ok(bd[2].band === 'front' && bd[2].show === 'always' && bd[2].fadeIn === 250, 'a bad band or show falls back');
  ok(sanitizeLayout({ collection: { custom: [{ id: 'q', kind: 'text', ...box, show: 'after' }] } }).collection.custom?.[0].show === 'always', 'the collection view has no reveal, so its layers drop Show');
  eq(cu.stepCustom(bd, 'b3', -1).map(l => l.id), ['b3', 'b2', 'b1'], 'a step back skips a layer of the other band');
  eq(cu.stepCustom(bd, 'b1', -1).map(l => l.id), ['b1', 'b2', 'b3'], 'the back of its band stays put');
  eq(cu.stepCustom(bd, 'b3', 1).map(l => l.id), ['b1', 'b2', 'b3'], 'the front of its band stays put');
  const dr = cu.moveCustomOnto(bd, 'b2', 'b3');
  ok(dr.map(l => l.id).join() === 'b1,b3,b2' && dr[2].band === 'front', 'a drop takes the target place and band');
  // 38.7 f: duplicate goes just above the original with a new id; paste appends copies, both stop at the cap.
  const dp = cu.duplicateCustom(bd, 'b1');
  ok(!!dp && dp.list.map(l => l.id).join() === 'b1,text1,b2,b3' && dp.added.name.endsWith(' copy') && dp.added.x === bd[0].x + 20 && dp.added.band === 'front', 'duplicate sits just above the original, offset, same band');
  ok(cu.duplicateCustom(bd, 'nope') === null, 'duplicate of a missing layer is null');
  const full = Array.from({ length: cu.MAX_CUSTOM }, (_, i) => ({ ...bd[0], id: `t${i}` }));
  ok(cu.duplicateCustom(full, 't0') === null && cu.pasteCustom(full, [bd[0]]) === null, 'duplicate and paste refuse past the cap');
  const ps = cu.pasteCustom(bd, [bd[0], bd[1]]);
  ok(!!ps && ps.list.length === 5 && new Set(ps.list.map(l => l.id)).size === 5 && ps.added[0].x === bd[0].x + 20, 'paste gives fresh ids and steps off an identical box');
  const n = cu.newCustom('shape', ['shape1'], 1280, 720);
  ok(n.id === 'shape2' && n.kind === 'shape' && cu.newCustom('image', [], 1280, 720).kind === 'image' && cu.newCustom('text', [], 1280, 720).kind === 'text', 'newCustom picks a free id');
  const before = sanitizeLayout({ pack: { custom: [{ id: 'a', kind: 'text', ...box, name: 'Old' }] } });
  const after = sanitizeLayout({ pack: { custom: [{ id: 'a', kind: 'text', ...box, name: 'Old', text: 'new' }, { id: 'b', kind: 'text', ...box, name: 'Fresh' }] } });
  const dl = diff.diffLayout(before, after);
  ok(dl.some(l => l.to.startsWith('added text "Fresh"')) && dl.some(l => l.label.includes('"Old"') && l.to.includes('text')), 'the diff reports an added and a changed layer');
  ok(diff.diffLayout(after, before).some(l => l.to === 'removed' && l.from.includes('Fresh')) && diff.diffLayout(before, before).length === 0, 'the diff reports a removed layer and nothing when equal');
  const two = sanitizeLayout({ pack: { custom: [{ id: 'a', kind: 'text', ...box, name: 'A' }, { id: 'b', kind: 'text', ...box, name: 'B' }] } });
  const swapped = sanitizeLayout({ pack: { custom: [{ id: 'b', kind: 'text', ...box, name: 'B' }, { id: 'a', kind: 'text', ...box, name: 'A' }] } });
  ok(diff.diffLayout(two, swapped).some(l => l.to === 'order changed') && !diff.diffLayout(before, after).some(l => l.to === 'order changed'), 'the diff reports reordered layers, not added ones');
  ok(/const customUrlOk/.test(readFileSync('public/widget.js', 'utf8')) && /function renderCustom/.test(readFileSync('public/widget.js', 'utf8')) && !/innerHTML/.test(/\/\/ ── Custom layers[\s\S]*?function applyLayout/.exec(readFileSync('public/widget.js', 'utf8'))?.[0] ?? 'innerHTML'), 'the widget draws custom layers without innerHTML');
  ok(/packageContainer\.style\.pointerEvents = 'none'/.test(readFileSync('public/widget.js', 'utf8')), 'the still preview lets presses through the hidden pack art to the card');
  // Text tool (38.7 b): vertical align, the box a press makes, a layer placed at a box, the widget's editing hooks.
  const va = (v: unknown) => (lay([{ id: 'v', kind: 'text', ...box, valign: v }])?.[0] as import('../lib/overlay-custom').CustomText).valign;
  ok(va('middle') === 'middle' && va('bottom') === 'bottom' && va('sideways') === 'top' && va(undefined) === 'top', 'text valign is top, middle or bottom, top by default');
  eq(cu.toolBox('text', 100, 50, 102, 52, 1280, 720), { x: 100, y: 50 }, 'a click gives the point only');
  eq(cu.toolBox('text', 1200, 700, 1200, 700, 1280, 720), { x: 880, y: 640 }, 'a click near the edge keeps the default box on the stage');
  eq(cu.toolBox('text', 300, 200, 100, 120, 1280, 720), { x: 100, y: 120, w: 200, h: 80 }, 'a drag in any direction gives the rectangle');
  eq(cu.toolBox('text', 10, 10, 18, 40, 1280, 720), { x: 10, y: 10, w: 20, h: 30 }, 'a thin drag is at least 20 px each way');
  const placed = cu.newCustom('text', [], 1280, 720, { x: 30, y: 40, w: 250, h: 60 });
  ok(placed.x === 30 && placed.y === 40 && placed.w === 250 && placed.h === 60, 'newCustom places the layer at the given box');
  const dflt = cu.newCustom('text', [], 1280, 720, { x: 30, y: 40 });
  ok(dflt.w === 400 && dflt.h === 80, 'a box with only a point keeps the default size');
  const wsrc = readFileSync('public/widget.js', 'utf8');
  ok(/dataset\.edit = 'custom:'/.test(wsrc) && /'dblclick'/.test(wsrc) && !/setWording\([^)]*, ''\);/.test(/function customLayerEl[\s\S]*?\nfunction dropCustom/.exec(wsrc)?.[0] ?? ''), 'the widget tags custom layers for editing, reports a double-click and passes the accent colour');
}
// Align / distribute: box moves become offset moves (divided by the view scale), a lone part aligns to the stage.
const bx = { a: { x: 100, y: 50, w: 100, h: 40 }, b: { x: 300, y: 80, w: 50, h: 20 }, c: { x: 700, y: 10, w: 100, h: 60 } };
eq(alignOffsets(bx, 'left', { w: 1280, h: 720 }), { a: { dx: 0, dy: 0 }, b: { dx: -200, dy: 0 }, c: { dx: -600, dy: 0 } }, 'align left to the selection box');
eq(alignOffsets(bx, 'bottom', { w: 1280, h: 720 }, 2).c, { dx: 0, dy: 15 }, 'align bottom, offsets divided by the view scale');
eq(alignOffsets({ a: bx.a }, 'center', { w: 1280, h: 720 }), { a: { dx: 490, dy: 0 } }, 'one part centres on the stage');
eq(measureGaps({ x: 0, y: 0, w: 100, h: 50 }, { x: 140, y: 20, w: 60, h: 60 }), [{ x1: 100, y1: 35, x2: 140, y2: 35, px: 40 }], 'measure: side by side, line across the overlap');
eq(measureGaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 40, w: 10, h: 10 }).map(g => g.px), [20, 30], 'measure: diagonal shows both gaps');
eq(measureGaps({ x: 0, y: 0, w: 50, h: 50 }, { x: 10, y: 10, w: 10, h: 10 }), [], 'measure: overlapping boxes show nothing');
eq(alignOffsets({ a: bx.a }, 'middle', { w: 1280, h: 720 }), { a: { dx: 0, dy: 290 } }, 'one part middles on the stage');
eq(distributeOffsets(bx, 'x'), { a: { dx: 0, dy: 0 }, b: { dx: 125, dy: 0 }, c: { dx: 0, dy: 0 } }, 'distribute spaces centres evenly');
eq(distributeOffsets({ a: bx.a, c: bx.c }, 'x'), {}, 'distribute needs three parts');
eq(anchorOffset({ x: 100, y: 50, w: 200, h: 100 }, { x: 0.5, y: 0.5 }, 1, 2), { dx: 0, dy: 0 }, 'anchor: the centre needs no shift');
eq(anchorOffset({ x: 100, y: 50, w: 200, h: 100 }, { x: 0, y: 0 }, 1, 2), { dx: 100, dy: 50 }, 'anchor: growing from the top-left shifts the offset by half the box');
eq(anchorOffset({ x: 100, y: 50, w: 200, h: 100 }, { x: 1, y: 1 }, 1, 0.5, 2), { dx: 25, dy: 12.5 }, 'anchor: shrinking from the bottom-right, divided by the view scale');
eq(diff.diffProps('x', { 'bogus.key': 1 }, {}, () => undefined), [], 'unknown keys are ignored');

// ── Engine, in a sandbox namespace ──
await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Overlay check', source: 'config' });
const prodBefore = JSON.stringify(await prodKv.get('overlay:versions'));
await runInSandbox(box.id, async () => {
  const cur = await settings.getOverlaySettings();
  await settings.saveOverlaySettings({ ...cur, props: { 'variant.shiny.glow': false } });
  await versions.recordVersion('first');
  await settings.saveOverlaySettings({ ...cur, props: { 'variant.shiny.glow': false, 'reveal.speed': 1.5 }, layout: { ...cur.layout, width: 1920 } });
  await versions.recordVersion('second');
  let list = await versions.listVersions();
  ok(list.length === 2 && list[0].note === 'second' && list[1].note === 'first', 'versions are newest first');
  ok(list[0].props['reveal.speed'] === 1.5 && list[0].layout.width === 1920, 'a version captures props and layout');
  await versions.applyVersion(list[1]);
  const back = await settings.getOverlaySettings();
  ok(back.props['reveal.speed'] === undefined && back.layout.width === cur.layout.width, 'applying an older version restores its look');
  for (let i = 0; i < 25; i++) await versions.recordVersion(`v${i}`);
  list = await versions.listVersions();
  ok(list.length === 20, 'history is capped at 20');
  await versions.deleteVersion(list[0].id);
  ok((await versions.listVersions()).length === 19, 'a version can be deleted');

  // Save conflict guard (ROADMAP 38.13): the editor sends the newest version id it loaded; a stale id is refused, a matching id or force saves.
  const newest = (await versions.listVersions())[0];
  eq((await versions.versionConflict(newest.id))?.id ?? null, null, 'the newest id matches, so the save goes through');
  await versions.recordVersion('theirs');
  eq((await versions.versionConflict(newest.id))?.note, 'theirs', 'a stale id is refused and returns their version');
  eq((await versions.versionConflict('', false))?.note, 'theirs', 'an editor that loaded no version id is refused too');
  eq((await versions.versionConflict(newest.id, true)) ?? null, null, 'overwrite (force) skips the check');
  await versions.recordVersion('mine');
  eq((await versions.versionConflict((await versions.listVersions())[0].id)) ?? null, null, 'after a save the new newest id matches');

  // Live refresh token
  const t0 = await settings.getReloadToken();
  await new Promise(r => setTimeout(r, 5));
  await settings.bumpReloadToken();
  ok((await settings.getReloadToken()) > t0, 'bumping changes the reload token');

  // Season looks
  await settings.savePreset('Neon', { 'reveal.speed': 2 });
  const preset = (await settings.listPresets()).find(p => p.name === 'Neon')!;
  const season = (await kvLib.listSeasons())[0];
  await settings.setSeasonLook(season.id, preset.id);
  eq((await settings.getSeasonLookPreset(season.id))?.props, { 'reveal.speed': 2 }, 'a season resolves its look preset');
  await settings.setSeasonLook(season.id, null);
  ok((await settings.getSeasonLookPreset(season.id)) === null, 'clearing the look follows global again');
  await settings.setSeasonLook(season.id, preset.id);
  await settings.deletePreset(preset.id);
  ok((await settings.getSeasonLookPreset(season.id)) === null, 'a deleted preset resolves to nothing');

  // ── Scheduled looks: layered over the season look while running, and the heartbeat token follows start / end ──
  {
    const { NextRequest } = await import('next/server');
    const { GET } = await import('../app/api/overlay/config/route');
    const speed = async () => ((await (await GET(new NextRequest('http://localhost/api/overlay/config'))).json()) as { props: Record<string, unknown> }).props['reveal.speed'];
    await settings.savePreset('Season look', { 'reveal.speed': 0.6 });
    await settings.savePreset('Halloween', { 'reveal.speed': 0.8 });
    await settings.savePreset('Late night', { 'reveal.speed': 1.2 });
    const ps = await settings.listPresets();
    const id = (n: string) => ps.find(p => p.name === n)!.id;
    await settings.setSeasonLook(season.id, id('Season look'));
    const T = Date.now();
    const H = 3600_000;
    eq(await speed(), 0.6, 'no schedule: the season look');
    ok(!(await settings.addScheduledLook(id('Halloween'), T + H, T + H)).ok, 'an end that is not after the start is refused');
    ok(!(await settings.addScheduledLook('nope', T, T + H)).ok, 'an unknown preset is refused');
    ok((await settings.addScheduledLook(id('Halloween'), T + H, T + 3 * H)).ok, 'a future schedule is saved');
    const before = await settings.getReloadSignal(T);
    eq(await speed(), 0.6, 'a schedule that has not started leaves the season look');
    ok((await settings.getReloadSignal(T + 2 * H)) !== before, 'the reload token changes when a schedule starts');
    eq(await settings.getReloadSignal(T + 4 * H), before, 'and goes back when it ends');
    await settings.addScheduledLook(id('Halloween'), T - H, T + H);
    eq(await speed(), 0.8, 'a running schedule layers over the season look');
    await settings.addScheduledLook(id('Late night'), T - H / 2, T + H);
    eq(await speed(), 1.2, 'of two overlapping schedules the later start wins');
    await settings.addScheduledLook(id('Late night'), T - 90 * 24 * H, T - 80 * 24 * H);
    await settings.addScheduledLook(id('Late night'), T + 5 * H, T + 6 * H);
    ok((await settings.getScheduledLooks()).every(s => s.end > T - 30 * 24 * H), 'an entry that ended long ago is dropped on the next write');
    for (const s of await settings.getScheduledLooks()) await settings.removeScheduledLook(s.id);
    eq(await speed(), 0.6, 'removing the schedules returns to the season look');
    await settings.setSeasonLook(season.id, null);
  }

  // ── Scenes: a preset with its own layout has its own overlay URL (?preset=<id>) ──
  {
    const { sceneLayout, isVertical } = await import('../lib/overlay-layout');
    const vertical = sceneLayout('vertical');
    ok(isVertical(vertical) && vertical.width === 1080 && vertical.height === 1920, 'a vertical scene starts from a 1080 x 1920 stage');
    eq(sceneLayout('landscape', { ...DEFAULT_LAYOUT, width: 1920, height: 1080 }).width, 1920, 'a landscape scene copies the layout it is based on');

    const id = (await settings.savePreset('Vertical', { 'collection.perRow': 4 }, vertical))!;
    ok(!!id, 'a scene is saved and its id returned');
    let scene = (await settings.getPreset(id))!;
    eq(scene.layout, vertical, 'the scene keeps its own layout');
    // Saving the same name again without a layout keeps the layout it had.
    await settings.savePreset('Vertical', { 'collection.perRow': 3 });
    scene = (await settings.getPreset(id))!;
    ok(scene.layout?.height === 1920 && scene.props['collection.perRow'] === 3, 'saving a preset again keeps its layout');
    // Editing the scene stores overrides even when they equal the default (they must beat a global value that is not the default).
    await settings.saveOverlaySettings({ ...(await settings.getOverlaySettings()), props: { 'collection.cardWidth': 90 } });
    await settings.updateScene(id, { props: { 'collection.cardWidth': 48 }, layout: { ...vertical, pack: { scale: 1.3, offsetX: 0, offsetY: -50 } } });
    scene = (await settings.getPreset(id))!;
    eq(scene.props['collection.cardWidth'], 48, 'a scene override equal to the default survives');
    eq(scene.layout?.pack, { scale: 1.3, offsetX: 0, offsetY: -50 }, 'updateScene stores the new layout');
    await settings.updateScene(id, { props: { 'collection.cardWidth': 48 }, layout: { ...vertical, pack: { ...vertical.pack, elements: { label: { scale: 1, offsetX: 7, offsetY: 0 } } } } });
    eq((await settings.getPreset(id))!.layout?.pack.elements, { label: { scale: 1, offsetX: 7, offsetY: 0 } }, 'a scene layout keeps its own elements');
    ok(!(await settings.updateScene('nope', { props: {} })), 'updating a scene that does not exist does nothing');

    // The overlay's config: global by default, the scene's layout and values on top with ?preset=.
    const { NextRequest } = await import('next/server');
    const { GET } = await import('../app/api/overlay/config/route');
    const cfg = async (q = '') => (await (await GET(new NextRequest('http://localhost/api/overlay/config' + q))).json()) as { layout: { width: number; height: number }; props: Record<string, unknown> };
    const globalCfg = await cfg();
    ok(globalCfg.layout.width === DEFAULT_LAYOUT.width && globalCfg.props['collection.cardWidth'] === 90, 'no preset: the global layout and look');
    ok(Array.isArray((globalCfg as { fonts?: { id: string }[] }).fonts) && (globalCfg as { fonts: { id: string }[] }).fonts.some(f => f.id === 'fredoka'), 'config sends the font catalog');
    const sceneCfg = await cfg('?preset=' + id);
    ok(sceneCfg.layout.width === 1080 && sceneCfg.layout.height === 1920, 'with ?preset: the scene layout');
    ok(sceneCfg.props['collection.cardWidth'] === 48, "with ?preset: the scene's values win over the global ones");
    eq((await cfg('?preset=unknown')).layout.width, DEFAULT_LAYOUT.width, 'an unknown preset id falls back to the global overlay');
    // A preset without a layout uses the global layout.
    const plain = (await settings.savePreset('Plain look', { 'collection.gap': 20 }))!;
    eq((await cfg('?preset=' + plain)).layout.width, DEFAULT_LAYOUT.width, 'a preset without its own layout uses the global layout');
    await settings.deletePreset(id); await settings.deletePreset(plain);
    await settings.saveOverlaySettings({ ...(await settings.getOverlaySettings()), props: {} });
  }

});
ok(JSON.stringify(await prodKv.get('overlay:versions')) === prodBefore, 'production versions untouched by the sandbox');
await sbx.deleteSandbox(box.id);
// Wording tokens: the widget's fillTokens and the TS twin give the same text.
{
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const { fillTokens, fillRuns, TOKEN_INFO } = await import('../lib/overlay-tokens');
  const w = readFileSync('public/widget.js', 'utf8').replace(/\r\n/g, '\n');
  const tsrc = /\/\/ TOKENS-START\n([^]*?)\/\/ TOKENS-END/.exec(w)?.[1];
  ok(tsrc, 'widget.js has the TOKENS block');
  const wFill = runInNewContext("const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Full Art Holo', golden: 'Golden' };" + tsrc + '; fillTokens', {}) as typeof fillTokens;
  const wRuns = runInNewContext("const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo' };" + tsrc + '; fillRuns', {}) as typeof fillRuns;
  const ctx = { user: 'cheesygidds', cardName: 'Cheesy Cheese', variant: 'reverse', pack: 'Starter', edition: 3, stars: 5 };
  const cases: [string, Parameters<typeof fillTokens>[1], string][] = [
    ['{user} got:', ctx, 'cheesygidds got:'],
    ['{username} got:', ctx, 'cheesygidds got:'],
    ['{user}/{username}', ctx, 'cheesygidds/cheesygidds'],
    ['{cardName} ({variant}) from {pack}: #{edition}, {stars} stars', ctx, 'Cheesy Cheese (Reverse Holo) from Starter: #3, 5 stars'],
    ['Hello {nobody} {constructor} {}', ctx, 'Hello {nobody} {constructor} {}'],
    ['{cardName} {edition} {pack}', { user: 'a' }, '{cardName} {edition} {pack}'],
    ['{variant}', { variant: 'weird' }, 'weird'],
    ['{user', ctx, '{user'],
    ['no tokens', {}, 'no tokens'],
    ['{stars}', { stars: 0 }, '0'],
  ];
  for (const [str, c, want] of cases) {
    eq(fillTokens(str, c), want, `fillTokens ${str}`);
    eq(wFill(str, c), want, `widget fillTokens ${str}`);
    eq(fillRuns(str, c).map(r => r.t).join(''), want, `fillRuns joins to fillTokens: ${str}`);
    eq(JSON.parse(JSON.stringify(wRuns(str, c))), fillRuns(str, c), `widget fillRuns matches: ${str}`);
  }
  eq(fillRuns('{user} got {nobody}: {cardName}', ctx), [{ t: 'cheesygidds', tok: true }, { t: ' got {nobody}: ', tok: false }, { t: 'Cheesy Cheese', tok: true }], 'only filled tokens are marked');
  eq(fillRuns('plain', {}), [{ t: 'plain', tok: false }], 'no tokens is one plain run');
  ok(Object.keys(TOKEN_INFO).every(k => /^[a-zA-Z]+$/.test(k)), 'token names are plain words');
  const { PROPS } = await import('../lib/overlay-props');
  for (const d of PROPS.filter(p => p.type === 'text' && p.tokens)) {
    ok(d.tokens!.includes('user'), `${d.key} offers {user}`);
    ok(d.fit || d.key.endsWith('.subText'), `${d.key} names its preview element`);
    if (d.sizeKey) ok(PROP_BY_KEY[d.sizeKey]?.type === 'number', `${d.key} size key ${d.sizeKey} is a number prop`);
  }
}
// Light markup (ROADMAP 38.10 b): one parser in lib, a port in the widget, same results.
{
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const { parseMarkup, stripMarkup, markupRuns } = await import('../lib/text-markup');
  const { fillTokens } = await import('../lib/overlay-tokens');
  const w = readFileSync('public/widget.js', 'utf8').replace(/\r\n/g, '\n');
  const tsrc = /\/\/ TOKENS-START\n([^]*?)\/\/ TOKENS-END/.exec(w)?.[1], msrc = /\/\/ MARKUP-START\n([^]*?)\/\/ MARKUP-END/.exec(w)?.[1];
  ok(tsrc && msrc, 'widget.js has the MARKUP block');
  const port = runInNewContext("const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo' };" + tsrc + msrc + '; ({ parseMarkup, markupRuns })', {}) as { parseMarkup: typeof parseMarkup; markupRuns: typeof markupRuns };
  const ctx = { user: 'cheesygidds', cardName: 'Cheesy Cheese', variant: 'reverse' };
  const cases: [string, unknown[]][] = [
    ['plain', [{ t: 'plain' }]],
    ['**bold** and *italic*', [{ t: 'bold', bold: true }, { t: ' and ' }, { t: 'italic', italic: true }]],
    ['*a **b** c*', [{ t: 'a ', italic: true }, { t: 'b', bold: true, italic: true }, { t: ' c', italic: true }]],
    ['{color:#FFCC00}gold{/color} text', [{ t: 'gold', color: '#ffcc00' }, { t: ' text' }]],
    ['**{color:#ff0000}red bold{/color}**', [{ t: 'red bold', bold: true, color: '#ff0000' }]],
    ['2 * 3 * 4', [{ t: '2 * 3 * 4' }]],
    ['a * b', [{ t: 'a * b' }]],
    ['**', [{ t: '**' }]],
    ['*', [{ t: '*' }]],
    ['**open', [{ t: '**open' }]],
    ['*open **b** x', [{ t: '*open ' }, { t: 'b', bold: true }, { t: ' x' }]],
    ['{color:red}x{/color}', [{ t: '{color:red}x{/color}' }]],
    ['{color:#12345}x{/color}', [{ t: '{color:#12345}x{/color}' }]],
    ['{color:#ff0000}never closed', [{ t: '{color:#ff0000}never closed' }]],
    ['{/color} stray', [{ t: '{/color} stray' }]],
    ['**x*', [{ t: '**x*' }]],
  ];
  for (const [str, want] of cases) {
    eq(parseMarkup(str), want, `parseMarkup ${str}`);
    eq(JSON.parse(JSON.stringify(port.parseMarkup(str))), want, `widget parseMarkup ${str}`);
  }
  eq(stripMarkup('**bold** *x* {color:#ffffff}w{/color}'), 'bold x w', 'stripMarkup drops matched markup');
  eq(stripMarkup('2 * 3 * 4 **'), '2 * 3 * 4 **', 'stripMarkup keeps literal stars');
  const mixed = ['**{user}** got: {cardName}', '*{user}*', '{color:#00ff00}{user}{/color}!', 'no markup {user}', '{nobody} **{variant}**'];
  for (const str of mixed) {
    eq(JSON.parse(JSON.stringify(port.markupRuns(str, ctx))), markupRuns(str, ctx), `widget markupRuns matches: ${str}`);
    eq(markupRuns(str, ctx).map(r => r.t).join(''), fillTokens(stripMarkup(str), ctx), `markupRuns joins to the filled plain text: ${str}`);
  }
  eq(markupRuns('**{user}** hi', ctx), [{ t: 'cheesygidds', bold: true, tok: true }, { t: ' hi' }], 'a token inside bold is filled and marked');
  eq(markupRuns('**{user}**', { user: 'a*b*' }), [{ t: 'a*b*', bold: true, tok: true }], 'a token value is never read as markup');
}
{
  // ROADMAP 38.31: the text formatting row.
  const { mixedFormat, MIXED, customTextFormat, applyCustomText } = await import('../lib/text-format');
  const a = { font: 'inherit', size: 20, color: '#ffffff', valign: 'top' as const, style: {} };
  const b = { ...a, size: 30 };
  eq(mixedFormat([customTextFormat(a), customTextFormat(b)]).size, MIXED, 'different sizes are mixed');
  eq(mixedFormat([customTextFormat(a), customTextFormat(b)]).color, '#ffffff', 'equal colours stay');
  eq(mixedFormat([{ size: 1 }, {}]).size, undefined, 'a control one layer lacks is not offered');
  const bold = applyCustomText(a, { bold: true, align: 'center', size: 36, highlight: true, highlightColor: '#ff0000' });
  eq([bold.style.weight, bold.style.align, bold.size, bold.style.accent], [700, 'center', 36, { on: true, color: '#ff0000' }], 'bold, align, size, highlight');
  eq(customTextFormat(bold).bold, true, 'bold reads back');
  eq(applyCustomText(bold, { bold: false, highlight: false }).style.accent?.on, false, 'highlight off keeps the colour with on:false');
  eq(applyCustomText(a, { highlight: false }).style, {}, 'highlight off on a plain layer stores nothing');
}
{
  // ROADMAP 38.21: saved swatches.
  const sw = await import('../lib/swatches');
  eq(sw.sanitizeSwatches(['#FF0000', '#ff0000', 'red', '#12345', 5, '#00ff00']), ['#ff0000', '#00ff00'], 'swatches: hex only, lowercased, unique');
  eq(sw.sanitizeSwatches('x'), [], 'swatches: non-array');
  eq(sw.sanitizeSwatches(Array.from({ length: 40 }, (_, i) => '#' + i.toString(16).padStart(6, '0'))).length, sw.MAX_SWATCHES, 'swatches: capped');
  eq(await sw.saveSwatches(['#abcdef', 'nope']), ['#abcdef'], 'swatches: save returns the clean list');
  eq(await sw.getSavedSwatches(), ['#abcdef'], 'swatches: read back');
  eq([sw.toHex('rgb(241,187,6)'), sw.toHex('#ABCDEF'), sw.toHex('blue')], ['#f1bb06', '#abcdef', null], 'swatches: toHex');
}
// ── Linked layers (ROADMAP 38.18): sanitizeLayout keeps known ids, each in one set of 2 or more; none by default ──
{
  ok(sanitizeLayout({}).pack.links === undefined && sanitizeLayout({ pack: { links: [] } }).pack.links === undefined, 'links: absent by default');
  const l = sanitizeLayout({ pack: { links: [['card', 'label', 'nope', 'heading'], ['label', 'bar'], ['bar', 'got'], 'x', ['strip']] }, collection: { links: [['heading', 'grid']] } });
  eq(l.pack.links, [['card', 'label'], ['bar', 'got']], 'links: unknown and other-view ids dropped, one set per id, singles dropped');
  eq(l.collection.links, [['heading', 'grid']], 'links: collection view');
  eq(sanitizeLayout({ pack: { links: 'nope' } }).pack.links, undefined, 'links: junk reads as none');
}
// ── Twitch UI zones (ROADMAP 38.25): saved per scope in the settings, clamped, capped, never in the widget config ──
{
  const { sanitizeZones, boxesOverlap } = await import('../lib/overlay-layout');
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'a' + i, name: ' '.repeat(2) + 'n'.repeat(60), x: 1270, y: -5, w: 900, h: 'x' }));
  const z = sanitizeZones(many, 1280, 720);
  ok(z.length === 12 && z[0].name.length === 40, 'zones: capped at 12, names trimmed to 40');
  eq([z[0].x, z[0].y, z[0].w, z[0].h], [1260, 0, 20, 20], 'zones: clamped to the stage, at least 20 px');
  eq(sanitizeZones('nope'), [], 'zones: junk reads as none');
  ok(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }) && !boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }), 'zones: overlap test');
  eq((await settings.getOverlaySettings()).zones, {}, 'zones: empty by default');
  await settings.saveZones('global', [{ id: 'cam', name: 'Webcam', x: 900, y: 400, w: 300, h: 250 }]);
  eq((await settings.getOverlaySettings()).zones.global.map(q => q.name), ['Webcam'], 'zones: saved per scope');
  await settings.saveZones('global', []);
  eq((await settings.getOverlaySettings()).zones, {}, 'zones: an empty list clears the scope');
}
// ── Pure: text readability (ROADMAP 38.26) ──
{
  const { parseHex, contrastRatio, inkFor, worstContrast } = await import('../lib/contrast');
  const W = parseHex('#fff')!, B = parseHex('#000000')!;
  ok(Math.abs(contrastRatio(W, B) - 21) < 0.01 && contrastRatio(W, W) === 1, 'contrast: white on black is 21:1');
  ok(parseHex('nope') === null, 'contrast: a bad colour is null');
  eq([inkFor(W), inkFor(B)], ['#000000', '#ffffff'], 'contrast: ink is the opposite of the background');
  const px = new Uint8Array(4 * 4 * 4).fill(255); // a 4 x 4 white buffer with one black pixel at (0,0)
  px.set([0, 0, 0, 255], 0);
  ok(worstContrast(W, px, 4, 4, { x: 2, y: 2, w: 1, h: 1 }) === 1, 'contrast: white text on a white area is 1:1');
  ok(worstContrast(W, px, 4, 4, { x: 0, y: 0, w: 3, h: 3 }) === 1, 'contrast: the worst sample counts');
  ok(Math.abs(worstContrast(W, px, 4, 4, { x: 0, y: 0, w: 0, h: 0 })! - 21) < 0.01, 'contrast: white text on the black pixel is 21:1');
  ok(worstContrast(W, px, 4, 4, { x: 10, y: 10, w: 2, h: 2 }) === null, 'contrast: a box off the buffer is skipped');
}
console.log('check-overlay: all checks passed');
