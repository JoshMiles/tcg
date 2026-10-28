// Writes build-info.json (gitignored) for `npm run dist`: the commit, the UTC build date and the PR number from the commit subject "... (#N)".
// The commit is GITHUB_SHA in CI, else git's HEAD.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const full = process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
const pr = /\(#(\d+)\)\s*$/.exec(git('log', '-1', '--format=%s', full))?.[1];
const info = { commit: full.slice(0, 7), full, date: new Date().toISOString(), ...(pr ? { pr: Number(pr) } : {}) };
writeFileSync(new URL('../build-info.json', import.meta.url), `${JSON.stringify(info, null, 2)}\n`);
console.log(`Stamped ${info.commit}${pr ? ` (PR #${pr})` : ''}`);
