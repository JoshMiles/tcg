// Writes .next-changelog.json (gitignored) from the merged PRs into main, before `next build` (ROADMAP 21.1). Never fails a build:
// no token, no network or an API error writes [] and prints a warning. `--ensure` only creates the empty file when it is missing
// (no network), so typecheck and the checks work on a fresh clone.
// Env: GITHUB_CHANGELOG_TOKEN (fine-grained, this repo, Pull requests: read), VERCEL_GIT_REPO_OWNER / VERCEL_GIT_REPO_SLUG
// (falling back to the git remote), CHANGELOG_SINCE (YYYY-MM-DD, default: the day this shipped).
import { existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEntries } from './changelog-parse.mjs';

const OUT = fileURLToPath(new URL('../.next-changelog.json', import.meta.url));
const SINCE_DEFAULT = '2026-10-17';
const MAX_PAGES = 10;

const write = entries => writeFileSync(OUT, JSON.stringify(entries, null, 2) + '\n');
const warn = msg => console.warn(`[changelog] ${msg}`);

function repoFromGit() {
  try {
    const url = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
    return m ? { owner: m[1], repo: m[2] } : null;
  } catch { return null; }
}

async function main() {
  if (process.argv.includes('--ensure')) { if (!existsSync(OUT)) write([]); return; }
  const token = (process.env.GITHUB_CHANGELOG_TOKEN ?? '').trim();
  if (!token) { write([]); warn('GITHUB_CHANGELOG_TOKEN is not set: the generated changelog is empty (the hand-written entries still show).'); return; }
  const git = repoFromGit();
  const owner = process.env.VERCEL_GIT_REPO_OWNER || git?.owner;
  const repo = process.env.VERCEL_GIT_REPO_SLUG || git?.repo;
  if (!owner || !repo) { write([]); warn('Could not tell which repository to read: the generated changelog is empty.'); return; }
  const since = process.env.CHANGELOG_SINCE || SINCE_DEFAULT;

  const prs = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'tcg-changelog' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error('unexpected GitHub answer');
    prs.push(...batch);
    // Sorted by last update: once a whole page was last touched before the cutoff, nothing merged since is further down.
    if (batch.length < 100 || batch.every(p => String(p.updated_at ?? '').slice(0, 10) < since)) break;
  }
  const { entries, problems } = buildEntries(prs, since);
  for (const p of problems) warn(p);
  write(entries);
  console.log(`[changelog] ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${owner}/${repo} since ${since}.`);
}

main().catch(err => {
  try { write([]); } catch { /* nothing more to do */ }
  warn(`could not read pull requests (${err?.message ?? err}): the generated changelog is empty.`);
});
