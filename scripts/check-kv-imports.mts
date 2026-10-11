// Fails if anything other than lib/db.ts imports the raw KV client. Everything must go through lib/db.ts so a sandbox's
// keys are always namespaced. Run: npx tsx scripts/check-kv-imports.mts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const skip = new Set(['node_modules', '.next', '.git', 'Old']);
const offenders: string[] = [];
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|mts|js|mjs|cjs)$/.test(name) || p.split('\\').join('/').endsWith('lib/db.ts') || name === 'check-kv-imports.mts') continue;
    if (/from\s+['"]@vercel\/kv['"]|require\(['"]@vercel\/kv['"]\)/.test(readFileSync(p, 'utf8'))) offenders.push(p);
  }
}
walk('.');
if (offenders.length) throw new Error('These files import @vercel/kv directly (use lib/db.ts):\n  ' + offenders.join('\n  '));
console.log('kv import check passed: only lib/db.ts uses @vercel/kv');
