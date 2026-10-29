// The TCG Bridge version rule (ROADMAP 56.1): a change under bridge/ (except bridge/README.md) or streamdeck/ or obs-plugin/ raises the minor of package.json's version above
// the base's, patch 0, and package-lock.json carries the same version twice. Usage: tsx scripts/check-version.ts <base ref> (CI passes HEAD^1, the merge commit's main side).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** The reasons a change breaks the rule, in words; empty = fine. `changed` are repo paths. */
export function versionProblems(changed: string[], baseVersion: string, version: string, lock: { version?: unknown; packages?: { ''?: { version?: unknown } } }): string[] {
  // streamdeck/ is the Stream Deck plugin the bridge build packs and ships (ROADMAP 57.13), so a change there is a bridge change.
  // obs-plugin/ is the OBS plugin the bridge build ships and installs (62.5), so it is one too (its README, like the bridge's, is exempt).
  if (!changed.some(f => (f.startsWith('bridge/') && f !== 'bridge/README.md') || f.startsWith('streamdeck/') || (f.startsWith('obs-plugin/') && f !== 'obs-plugin/README.md'))) return [];
  const b = SEMVER.exec(baseVersion);
  const v = SEMVER.exec(version);
  if (!v) return [`bridge/package.json version "${version}" is not x.y.z.`];
  const problems: string[] = [];
  if (!b) problems.push(`main's bridge version "${baseVersion}" is not x.y.z, so it cannot be compared.`);
  else if (+v[3] !== 0 || !(+v[1] > +b[1] || (+v[1] === +b[1] && +v[2] > +b[2]))) {
    problems.push(`This change touches TCG Bridge, so bridge/package.json must raise the minor version above main's ${baseVersion} with patch 0 (for example ${b[1]}.${+b[2] + 1}.0). It says ${version}.`);
  }
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    problems.push(`bridge/package-lock.json must say ${version} in both its "version" fields (run "npm install --package-lock-only" in bridge/). It says ${String(lock.version)} and ${String(lock.packages?.['']?.version)}.`);
  }
  return problems;
}

if (require.main === module) {
  const base = process.argv[2] || 'origin/main';
  const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' });
  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const baseVersion = (JSON.parse(git('show', `${base}:bridge/package.json`)) as { version: string }).version;
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const problems = versionProblems(changed, baseVersion, version, JSON.parse(readFileSync('package-lock.json', 'utf8')));
  for (const p of problems) console.error(`::error::${p}`);
  if (problems.length) process.exit(1);
  console.log(`Version rule: fine (${baseVersion} on main, ${version} here).`);
}
