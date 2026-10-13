// Builds and checks the Twitch extension's hosted-version package: the zip uploaded under the extension version's Asset Hosting.
//
// Twitch serves hosted files from its own domain (https://<client id>.ext-twitch.tv), under a Content Security Policy, so the package
// differs from what the site serves at /twitch-panel/:
//   - the three viewer pages sit at the root of the zip, all files are referenced relatively, and nothing loads from anywhere except the
//     zip itself and Twitch's helper script (no site analytics script, no fake Twitch helper used for local testing)
//   - there are no inline scripts or inline event handlers (Twitch's CSP blocks them)
//   - config.js holds the site's address, because the API and the card art are on the site (cross-origin; the site answers with CORS)
//   - the site's own pages (Terms, Privacy) are linked absolutely
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeZip } from './zip.mjs';

export const VIEWS = ['panel.html', 'mobile.html', 'video_component.html'];
export const SCRIPTS = ['config.js', 'panel.js', 'trades.js'];
export const STYLES = ['panel.css', 'views.css'];
export const TWITCH_HELPER = 'https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js';

const SRC = join('public', 'twitch-panel');
const read = name => readFileSync(join(SRC, name), 'utf8');

export function packageVersion() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version;
}

/** The package's files: [{ name, data }]. `site` is the site's public address (no trailing slash). */
export function buildPackageFiles(site) {
  const origin = site.replace(/\/$/, '');
  const files = [];
  for (const v of VIEWS) {
    let html = read(v).replace(/\r\n/g, '\n');
    html = html
      .replace(/^[ \t]*<script defer src="\/_vercel\/insights\/script\.js"><\/script>\n/m, '')   // the site's analytics, not allowed here
      .replace(/^[ \t]*<script src="mock-twitch-ext\.js"><\/script>\n/m, '')                    // the local fake Twitch helper
      .replace(/href="\/(terms|privacy)"/g, `href="${origin}/$1"`);                              // the site's own pages
    files.push({ name: v, data: Buffer.from(html) });
  }
  for (const f of [...SCRIPTS, ...STYLES]) {
    let text = read(f).replace(/\r\n/g, '\n');
    if (f === 'config.js') text = text.replace(/window\.TCG_SITE = '[^']*';/, `window.TCG_SITE = '${origin}';`);
    files.push({ name: f, data: Buffer.from(text) });
  }
  return files;
}

/** Everything wrong with a package (an empty list means it is fine). Pure: give it the files from buildPackageFiles or readZip. */
export function validatePackage(files, site) {
  const problems = [];
  const origin = site.replace(/\/$/, '');
  const byName = new Map(files.map(f => [f.name, f.data.toString('utf8')]));
  for (const v of [...VIEWS, ...SCRIPTS, ...STYLES]) if (!byName.has(v)) problems.push(`${v} is missing from the package`);
  for (const f of files) if (f.name.includes('/') || f.name.startsWith('.')) problems.push(`${f.name}: every file must sit at the root of the zip`);
  if (byName.has('mock-twitch-ext.js')) problems.push('mock-twitch-ext.js must not be shipped');

  for (const v of VIEWS) {
    const html = byName.get(v) ?? '';
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = /\bsrc="([^"]*)"/.exec(m[1])?.[1];
      if (!src) problems.push(`${v}: an inline script (Twitch's CSP blocks it)`);
      else if (/^https?:\/\//.test(src)) { if (src !== TWITCH_HELPER) problems.push(`${v}: external script ${src} (only Twitch's helper is allowed)`); }
      else if (src.startsWith('/') || !byName.has(src)) problems.push(`${v}: script "${src}" is not a relative file in the package`);
      if (m[2].trim() && src) problems.push(`${v}: a script tag with both src and inline code`);
    }
    for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]*)"[^>]*>/gi)) {
      if (!/\brel="stylesheet"/i.test(m[0])) continue;
      if (/^https?:|^\//.test(m[1]) || !byName.has(m[1])) problems.push(`${v}: stylesheet "${m[1]}" is not a relative file in the package`);
    }
    if (/\son[a-z]+\s*=\s*["']/i.test(html)) problems.push(`${v}: an inline event handler (Twitch's CSP blocks it)`);
    if (/javascript:/i.test(html)) problems.push(`${v}: a javascript: link`);
    if (/<style\b/i.test(html)) problems.push(`${v}: an inline <style> block`);
    if (/_vercel|insights/i.test(html)) problems.push(`${v}: still references the site's analytics`);
    for (const m of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) problems.push(`${v}: site-relative path ${m[1]} (it would point at Twitch's domain)`);
    if (!html.includes(`href="${origin}/terms"`) || !html.includes(`href="${origin}/privacy"`)) problems.push(`${v}: the Terms and Privacy links are not absolute`);
    const order = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/gi)].map(m => m[1]);
    if (!order.includes('config.js') || !order.includes('panel.js') || !order.includes('trades.js')) problems.push(`${v}: does not load config.js, panel.js and trades.js`);
    else if (order.indexOf('config.js') > order.indexOf('panel.js') || order.indexOf('panel.js') > order.indexOf('trades.js')) problems.push(`${v}: scripts must load in the order config.js, panel.js, trades.js`);
  }
  const cfg = byName.get('config.js') ?? '';
  if (!cfg.includes(`window.TCG_SITE = '${origin}';`)) problems.push(`config.js does not point at ${origin}`);
  for (const js of ['panel.js', 'trades.js']) {
    const text = byName.get(js) ?? '';
    for (const m of text.matchAll(/\bfetch\(\s*(?!api\()([^\n]{0,40})/g)) problems.push(`${js}: a fetch that does not go through api(): fetch(${m[1].trim()}`);
    if (/importScripts|eval\(|new Function\(/.test(text)) problems.push(`${js}: dynamic code loading`);
  }
  for (const css of STYLES) {
    const text = byName.get(css) ?? '';
    for (const m of text.matchAll(/url\(\s*(['"]?)(?!data:)([^'")]+)\1\s*\)/g)) problems.push(`${css}: loads ${m[2]} (only data: URIs are self-contained)`);
    if (/@import/.test(text)) problems.push(`${css}: @import`);
  }
  return problems;
}

/** Builds the zip (throws if the package breaks a rule). */
export function buildPackage(site) {
  const files = buildPackageFiles(site);
  const problems = validatePackage(files, site);
  if (problems.length) throw new Error('The package breaks Twitch hosting rules:\n- ' + problems.join('\n- '));
  return { files, zip: makeZip(files) };
}
