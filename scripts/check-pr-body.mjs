// Fails when a PR body does not follow .github/pull_request_template.md (see prBodyProblems in changelog-parse.mjs).
// CI: reads the pull_request event (GITHUB_EVENT_PATH). Locally: gh pr view N --json body --jq .body | node scripts/check-pr-body.mjs ["title"]
import { readFileSync } from 'node:fs';
import { prBodyProblems } from './changelog-parse.mjs';

let body;
let title;
if (process.env.GITHUB_EVENT_PATH) {
  const pr = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request ?? {};
  body = pr.body;
  title = pr.title;
} else {
  body = readFileSync(0, 'utf8').replace(/^\u{FEFF}/u, ''); // PowerShell pipes add a BOM
  title = process.argv[2];
}
const problems = prBodyProblems(body, title);
if (problems.length) {
  console.error('PR description does not follow .github/pull_request_template.md:');
  for (const p of problems) console.error('- ' + p);
  process.exit(1);
}
console.log('PR description ok');
