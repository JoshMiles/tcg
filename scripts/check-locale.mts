// A client component is rendered on the server first and then again in the browser, so a date printed in "the machine's locale"
// comes out differently on each (Vercel's server is en-US, a UK visitor's browser is en-GB) and React reports a hydration
// mismatch. The same goes for the time zone (the server is UTC, the browser is wherever the visitor is). This fails if a client
// component formats a Date with toLocaleString / toLocaleDateString / toLocaleTimeString with no locale, or with a locale but no
// `timeZone`. Pure (reads files). Run: npx tsx scripts/check-locale.mts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const bad: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.tsx$/.test(name)) continue;
    const src = readFileSync(p, 'utf8');
    if (!/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src)) continue;
    src.split(/\r?\n/).forEach((line, i) => {
      if (/new Date\([^)]*\)[^;]{0,40}\.toLocale(Date|Time)?String\(\s*\)/.test(line) || /\bDate\.now\(\)\)\.toLocale(Date|Time)?String\(\s*\)/.test(line)) bad.push(`${relative(root, p)}:${i + 1}`);
      else if (/new Date\([^)]*\)[^;]{0,60}\.toLocale(Date|Time)?String\(/.test(line) && !/timeZone/.test(line)) bad.push(`${relative(root, p)}:${i + 1} (no timeZone)`);
    });
  }
};
walk(join(root, 'app'));
if (bad.length) throw new Error(`FAILED: a Date is formatted in the machine's locale in a client component (use 'en-GB' and timeZone: 'UTC'):\n  ${bad.join('\n  ')}`);
console.log('locale check passed');
