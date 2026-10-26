// Checks the Twitch hosted-version package: it builds, passes Twitch's hosting rules, survives a zip round trip, the rules really catch
// breakages, the panel's site-address helpers behave, and the site answers the extension's cross-origin calls only for Twitch's domain.
// Run: npx tsx scripts/check-twitch-package.mts
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NextRequest } from 'next/server';
import { readZip } from './lib/zip.mjs';
import { VIEWS, buildPackage, buildPackageFiles, packageVersion, validatePackage } from './lib/twitch-package.mjs';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const SITE = 'https://cheesytcg.app';

// ── builds, valid, round-trips ──
const built = buildPackage(SITE);
ok(built.files.length === 8 && built.files.every(f => !f.name.includes('/')), 'eight files, all at the root of the zip');
ok(validatePackage(built.files, SITE).length === 0, 'the package passes the hosting rules');
const back = readZip(built.zip);
ok(back.length === built.files.length && back.every((f: { name: string; data: Buffer }) => built.files.find((b: { name: string; data: Buffer }) => b.name === f.name)?.data.equals(f.data)), 'the zip reads back to exactly the same files');
ok(built.zip.length < 1_000_000, 'the package is small (' + built.zip.length + ' bytes)');
ok(buildPackage(SITE).zip.equals(built.zip), 'building twice gives the same zip');
for (const v of VIEWS) {
  const html = built.files.find((f: { name: string }) => f.name === v)!.data.toString();
  ok(!html.includes('_vercel') && !html.includes('mock-twitch-ext'), `${v}: no analytics and no fake Twitch helper`);
  ok(html.includes(`href="${SITE}/terms"`) && html.includes(`href="${SITE}/privacy"`), `${v}: Terms and Privacy are linked on the site`);
}
ok(built.files.find((f: { name: string }) => f.name === 'config.js')!.data.toString().includes(`window.TCG_SITE = '${SITE}';`), 'config.js points at the site');
ok(readFileSync('public/twitch-panel/config.js', 'utf8').includes("window.TCG_SITE = '';"), 'the site\'s own copy of config.js stays same-origin');

// ── the rules catch real breakages ──
const edit = (name: string, fn: (s: string) => string) => buildPackageFiles(SITE).map((f: { name: string; data: Buffer }) => (f.name === name ? { ...f, data: Buffer.from(fn(f.data.toString())) } : f));
const hasProblem = (files: unknown, re: RegExp) => (validatePackage(files as never, SITE) as string[]).some(p => re.test(p));
ok(hasProblem(edit('panel.html', s => s.replace('</body>', '<script>alert(1)</script></body>')), /inline script/), 'an inline script is caught');
ok(hasProblem(edit('panel.html', s => s.replace('</body>', '<script src="https://cdn.example.com/x.js"></script></body>')), /external script/), 'an external script is caught');
ok(hasProblem(edit('panel.html', s => s.replace('</head>', '<script defer src="/_vercel/insights/script.js"></script></head>')), /analytics|not a relative file/), 'the site analytics script is caught');
ok(hasProblem(edit('panel.html', s => s.replace('<body', '<body onload="init()"')), /inline event handler/), 'an inline event handler is caught');
ok(hasProblem(edit('panel.html', s => s.replace('href="panel.css"', 'href="/twitch-panel/panel.css"')), /stylesheet/), 'a site-relative stylesheet is caught');
ok(hasProblem(edit('mobile.html', s => s.replace(`href="${SITE}/terms"`, 'href="/terms"')), /site-relative path|not absolute/), 'a site-relative link is caught');
ok(hasProblem(edit('panel.js', s => s + "\nfetch('/api/twitch/season');"), /does not go through api/), 'a fetch that skips api() is caught');
ok(hasProblem(edit('panel.css', s => s + '\n.x { background: url(/img/a.png); }'), /loads/), 'a CSS file that loads an image is caught');
ok(hasProblem(edit('config.js', () => "window.TCG_SITE = '';"), /config\.js does not point/), 'a config.js left on the same origin is caught');
ok(hasProblem(buildPackageFiles(SITE).filter((f: { name: string }) => f.name !== 'trades.js'), /trades\.js is missing/), 'a missing file is caught');
ok(hasProblem(edit('video_component.html', s => s.replace('<script src="config.js"></script>', '').replace('<script src="panel.js"></script>', '<script src="panel.js"></script><script src="config.js"></script>')), /order/), 'config.js loading after panel.js is caught');

ok(hasProblem(edit('mobile.html', s => s.replace(/(<script src="https:\/\/extension-files[^\n]*\n)([\s\S]*?)(<script src="config\.js"><\/script>\n)/, '$3$1')), /helper script must be the first/), 'Twitch\'s helper loading after another script is caught');
ok(hasProblem(edit('panel.css', s => s.replace(/a\[target="_blank"\]::after/, 'a.off-site::after')), /off-site marker/), 'a missing off-site marker rule is caught');
ok(hasProblem(edit('panel.css', s => s.replace(/(a\[target="_blank"\]::after \{ )content: '[^']*';/, "$1content: '';")), /off-site marker/), 'an off-site marker rule with no visible content is caught');

// ── the panel's helpers (the code itself, run in isolation) ──
const panel = readFileSync('public/twitch-panel/panel.js', 'utf8').replace(/\r\n/g, '\n');
const start = panel.indexOf('const SITE = ');
const end = panel.indexOf('\n}\n', panel.indexOf('function absolutizeUrls')) + 3;
ok(start > 0 && end > start, 'the helpers are where the build expects them');
const helpers = (site?: string) => vm.runInNewContext(`${panel.slice(start, end)}; ({ SITE, api, absUrl, absolutizeUrls })`, { window: { TCG_SITE: site } }) as {
  SITE: string; api: (p: string) => string; absUrl: (u: unknown) => unknown; absolutizeUrls: (o: unknown) => unknown;
};
{
  const h = helpers('https://cheesytcg.app/');
  ok(h.SITE === 'https://cheesytcg.app' && h.api('/api/twitch/season') === 'https://cheesytcg.app/api/twitch/season', 'API paths get the site address (trailing slash tidied)');
  ok(h.absUrl('/assets/cards/a.webp') === 'https://cheesytcg.app/assets/cards/a.webp', 'a site path becomes absolute');
  ok(h.absUrl('https://x.public.blob.vercel-storage.com/a.webp') === 'https://x.public.blob.vercel-storage.com/a.webp' && h.absUrl('//cdn/x.png') === '//cdn/x.png' && h.absUrl(undefined) === undefined, 'absolute, protocol-relative and missing URLs are left alone');
  const season = { name: 's', packs: [{ coverImageUrl: '/assets/pack-cover.png', cards: [{ number: 1, imageUrl: '/assets/cards/a.webp', thumbUrl: '/assets/cards/thumb/a.webp', fullArtImageUrl: '/f.webp', fullArtThumbUrl: '/f.thumb.webp', name: '/not-a-url' }] }] };
  h.absolutizeUrls(season);
  const c = season.packs[0].cards[0];
  ok(season.packs[0].coverImageUrl.startsWith('https://') && c.imageUrl.startsWith('https://') && c.thumbUrl.startsWith('https://') && c.fullArtImageUrl.startsWith('https://') && c.fullArtThumbUrl.startsWith('https://'), 'every card and cover image in a season response becomes absolute');
  ok(c.name === '/not-a-url', 'other fields are left alone');
  const same = helpers('');
  ok(same.api('/api/x') === '/api/x' && same.absUrl('/assets/a.webp') === '/assets/a.webp', 'with no site address (served by the site itself) nothing changes');
}

ok(/^\d+\.\d+\.\d+$/.test(packageVersion()), 'the zip is named after the panel version (PANEL_VERSION in panel.js), not the site version');

// ── cross-origin calls from Twitch's domain ──
{
  const { middleware } = await import('../middleware');
  const call = async (method: string, path: string, origin?: string) => middleware(new NextRequest(`https://cheesytcg.app${path}`, { method, headers: origin ? { origin } : {} }));
  const EXT = 'https://abcdefghij1234567890abcdefghij.ext-twitch.tv';
  const pre = await call('OPTIONS', '/api/twitch/login', EXT);
  ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === EXT && /Authorization/.test(pre.headers.get('access-control-allow-headers') ?? '') && /POST/.test(pre.headers.get('access-control-allow-methods') ?? ''), 'a preflight from the extension\'s domain is allowed (Authorization header, POST)');
  const get = await call('GET', '/api/twitch/season', EXT);
  ok(get.headers.get('access-control-allow-origin') === EXT && get.headers.get('vary')?.includes('Origin'), 'a normal call from the extension\'s domain gets the headers');
  ok((await call('GET', '/api/version', EXT)).headers.get('access-control-allow-origin') === EXT, '/api/version is covered too');
  for (const bad of ['https://evil.example.com', 'https://abc.ext-twitch.tv.evil.com', 'http://abc.ext-twitch.tv', 'https://ext-twitch.tv', 'https://a.b.ext-twitch.tv', 'null']) {
    const r = await call('GET', '/api/twitch/season', bad);
    ok(!r.headers.get('access-control-allow-origin'), `${bad} is not allowed`);
    const p = await call('OPTIONS', '/api/twitch/login', bad);
    ok(p.status === 204 && !p.headers.get('access-control-allow-origin'), `a preflight from ${bad} is answered without permission`);
  }
  ok(!(await call('GET', '/api/twitch/season')).headers.get('access-control-allow-origin'), 'a call with no Origin gets no CORS headers');
  ok((await call('OPTIONS', '/api/twitch/login', 'http://localhost:4400')).headers.get('access-control-allow-origin') === 'http://localhost:4400', 'in development another local port may call the API');
}

console.log('twitch package checks passed');
