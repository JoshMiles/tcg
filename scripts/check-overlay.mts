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
const { DEFAULT_LAYOUT } = await import('../lib/overlay-layout');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const { runInSandbox, prodKv } = await import('../lib/db');

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
});
ok(JSON.stringify(await prodKv.get('overlay:versions')) === prodBefore, 'production versions untouched by the sandbox');
await sbx.deleteSandbox(box.id);
console.log('check-overlay: all checks passed');
