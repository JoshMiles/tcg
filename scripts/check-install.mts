// Checks the "add to home screen" pieces: device detection, the manifest and the icons it points at. Pure (no database).
// Run: npx tsx scripts/check-install.mts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const { detectInstallEnv } = await import('../lib/install-detect');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const MAC = IPAD;
const INSTAGRAM = `${IPHONE} Instagram 320.0.0`;
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.0.0 Mobile Safari/537.36';

ok(detectInstallEnv(IPHONE).platform === 'ios' && detectInstallEnv(IPHONE).browser === 'safari', 'iPhone Safari');
ok(detectInstallEnv(IPHONE_CHROME).browser === 'chrome' && detectInstallEnv(IPHONE_CHROME).platform === 'ios', 'Chrome on iPhone');
ok(detectInstallEnv(IPAD, 5).platform === 'ios', 'iPadOS (reports as a Mac, has touch)');
ok(detectInstallEnv(MAC, 0).platform === 'desktop', 'a real Mac has no touch points');
ok(detectInstallEnv(ANDROID).platform === 'android' && detectInstallEnv(ANDROID).browser === 'chrome', 'Android Chrome');
ok(detectInstallEnv(SAMSUNG).browser === 'samsung', 'Samsung Internet');
ok(detectInstallEnv(WINDOWS).platform === 'desktop', 'Windows desktop');
ok(detectInstallEnv(INSTAGRAM).inApp && !detectInstallEnv(IPHONE).inApp, 'in-app browsers are spotted, Safari is not one');
ok(detectInstallEnv(ANDROID_WEBVIEW).inApp, 'an Android WebView is an in-app browser');

// The manifest: installable by Chrome's rules (192 + 512 icons, a name, standalone) and every file exists.
const manifest = (await import('../app/manifest')).default();
ok(manifest.display === 'standalone' && manifest.name && manifest.short_name && manifest.start_url, 'manifest basics');
const icons = manifest.icons ?? [];
ok(icons.some(i => i.sizes === '192x192') && icons.some(i => i.sizes === '512x512'), 'manifest has 192 and 512 icons');
ok(icons.some(i => i.purpose === 'maskable'), 'manifest has a maskable icon');
for (const i of icons) ok(existsSync(join(process.cwd(), 'public', i.src)), `icon file exists: ${i.src}`);
for (const s of manifest.shortcuts ?? []) ok(s.url.startsWith('/'), `shortcut is a local path: ${s.url}`);
ok(existsSync(join(process.cwd(), 'public', 'apple-touch-icon-v3.png')), 'the iOS home-screen icon exists');

// iOS launch screens: listed in the layout's metadata, and every listed file exists.
const layout = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
ok(layout.includes('startupImage: IPHONE_SCREENS.map'), 'the layout lists the iPhone startup images');
const screens = [...(layout.match(/IPHONE_SCREENS = (\[\[.*\]\]);/)?.[1] ?? '[]').matchAll(/\[(\d+), (\d+), (\d)\]/g)];
ok(screens.length >= 10, 'the layout has the iPhone screen sizes');
for (const [, w, h, r] of screens) ok(existsSync(join(process.cwd(), 'public', 'splash', `${w}x${h}@${r}.png`)), `startup image exists: ${w}x${h}@${r}`);

// The service worker never touches the admin, API or login, and only ever answers page loads.
const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
ok(sw.includes("req.mode !== 'navigate'") && /admin\|api\|auth/.test(sw), 'service worker only handles public page loads');
ok(sw.includes('/offline') && existsSync(join(process.cwd(), 'app', 'offline', 'page.tsx')), 'the offline page exists');

// The nav's install icon is for phones and tablets only: a desktop browser hides it before the install prompt is even considered (15.2).
const btn = readFileSync(join(process.cwd(), 'app', 'components', 'site', 'InstallButton.tsx'), 'utf8');
const deskAt = btn.indexOf("env.platform === 'desktop'"), promptAt = btn.indexOf('getInstallPrompt()');
ok(deskAt > 0 && promptAt > deskAt, 'InstallButton hides on desktop before it checks the install prompt');
ok(!detectInstallEnv(DESKTOP_CHROME_UA, 0).inApp && detectInstallEnv(DESKTOP_CHROME_UA, 0).platform === 'desktop', 'desktop Chrome counts as desktop');

console.log('install checks passed');
