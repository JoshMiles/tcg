// Runs every scripts/check-*.mts against a fresh mock KV each (they share nothing, so each starts empty).
// Usage: node scripts/run-checks.mjs [filter ...]   (a filter keeps files whose name contains it)
// A check fails by throwing / exiting non-zero. A check that cannot run here prints a line starting
// "skipped: <reason>" and exits 0; the runner counts those separately.

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const filters = process.argv.slice(2);
const files = readdirSync(join(root, 'scripts'))
  .filter((f) => /^check-.*\.mts$/.test(f))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();

if (!files.length) {
  console.error('No checks match.');
  process.exit(1);
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function startMock() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(root, 'scripts', 'mock-kv.cjs')], {
    env: { ...process.env, MOCK_KV_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (c) => reject(new Error(`mock KV exited early (${c})`)));
    child.stdout.on('data', (d) => String(d).includes('mock kv on') && resolve());
  });
  child.removeAllListeners('exit');
  return { port, stop: () => child.kill() };
}

function runCheck(file, port) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      KV_REST_API_URL: `http://localhost:${port}`,
      KV_REST_API_TOKEN: 'dev',
      KV_URL: 'redis://dev',
    };
    const child = spawn(process.execPath, [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join('scripts', file)], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function runOne(file) {
  const mock = await startMock();
  const t0 = Date.now();
  const r = await runCheck(file, mock.port);
  mock.stop();
  return { ...r, secs: ((Date.now() - t0) / 1000).toFixed(1) };
}

// Each check has its own mock KV, so they run side by side: 4 at a time on CI, 2 locally (one heavy run at a time on the laptop), CHECK_JOBS overrides.
const jobs = Math.max(1, Number(process.env.CHECK_JOBS) || (process.env.CI ? 4 : 2));
const done = new Array(files.length);
let next = 0;
let shown = 0;
const results = [];
function print() { // in file order, as each earlier one finishes
  while (shown < files.length && done[shown]) {
    const { code, out, secs, retried } = done[shown];
    const skipped = code === 0 && /^skipped:/m.test(out);
    const status = code !== 0 ? 'FAIL' : skipped ? 'skip' : 'pass';
    console.log(`${status.padEnd(4)}  ${files[shown]}  (${secs}s)${retried ? '  passed on a retry; it failed once:' : ''}`);
    if (status === 'FAIL' || retried) console.log((retried ?? out).trimEnd().split('\n').map((l) => '      ' + l).join('\n'));
    if (skipped) console.log('      ' + out.match(/^skipped:.*$/m)[0]);
    results.push(status);
    shown++;
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, async () => {
  while (next < files.length) {
    const i = next++;
    let r = await runOne(files[i]);
    if (r.code !== 0) { const again = await runOne(files[i]); if (again.code === 0) r = { ...again, retried: r.out }; } // a timing flake gets one more try, shown in the output
    done[i] = r;
    print();
  }
}));

const n = (s) => results.filter((r) => r === s).length;
console.log(`\n${n('pass')} passed, ${n('FAIL')} failed, ${n('skip')} skipped (${results.length} checks)`);
process.exit(n('FAIL') ? 1 : 0);
