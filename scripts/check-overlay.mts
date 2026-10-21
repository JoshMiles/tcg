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
const { DEFAULT_LAYOUT, sanitizeLayout, alignOffsets, distributeOffsets } = await import('../lib/overlay-layout');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const { runInSandbox, prodKv } = await import('../lib/db');

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
  ok(fredoka?.file === 'fredoka-700.woff2' && fredoka.family === 'BackFredoka' && fredoka.weight === 700, 'catalog prefers the 700 card-back file');
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
// Align / distribute: box moves become offset moves (divided by the view scale), a lone part aligns to the stage.
const bx = { a: { x: 100, y: 50, w: 100, h: 40 }, b: { x: 300, y: 80, w: 50, h: 20 }, c: { x: 700, y: 10, w: 100, h: 60 } };
eq(alignOffsets(bx, 'left', { w: 1280, h: 720 }), { a: { dx: 0, dy: 0 }, b: { dx: -200, dy: 0 }, c: { dx: -600, dy: 0 } }, 'align left to the selection box');
eq(alignOffsets(bx, 'bottom', { w: 1280, h: 720 }, 2).c, { dx: 0, dy: 15 }, 'align bottom, offsets divided by the view scale');
eq(alignOffsets({ a: bx.a }, 'center', { w: 1280, h: 720 }), { a: { dx: 490, dy: 0 } }, 'one part centres on the stage');
eq(alignOffsets({ a: bx.a }, 'middle', { w: 1280, h: 720 }), { a: { dx: 0, dy: 290 } }, 'one part middles on the stage');
eq(distributeOffsets(bx, 'x'), { a: { dx: 0, dy: 0 }, b: { dx: 125, dy: 0 }, c: { dx: 0, dy: 0 } }, 'distribute spaces centres evenly');
eq(distributeOffsets({ a: bx.a, c: bx.c }, 'x'), {}, 'distribute needs three parts');
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
console.log('check-overlay: all checks passed');
