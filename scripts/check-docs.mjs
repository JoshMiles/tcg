// Fails a PR that changes code without touching the docs that describe it (docs/doc-map.json, plus each staff wiki page's "covers:" line).
// CI: reads the pull_request event (GITHUB_EVENT_PATH) and diffs against origin/<base>. Locally:
//   gh pr view N --json body --jq .body | node scripts/check-docs.mjs origin/main
// A doc that needs no change is skipped with a line in the PR body's "## Docs" section:
//   No change needed: docs/overlay.md: only renamed an internal helper
// ("all" instead of a path skips every doc). See docs/git-and-prs.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Files whose change never asks for a doc update: planning and history files, and the PR template itself. */
const NEVER_STALE = ['ROADMAP.md', 'HANDOFF.md', '.github/pull_request_template.md'];
const MIN_REASON_WORDS = 3;

/** A path glob ("**" crosses folders, "*" and "?" stay inside one) as a RegExp. Brackets and parentheses are literal. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
export const matchesAny = (globs, file) => globs.some(g => globToRegExp(g).test(file));

/** The `covers:` globs from a wiki page's front matter (comma separated), or []. */
export function parseCovers(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return [];
  const end = text.indexOf('\n---\n', 4);
  const m = /^covers:[ \t]*(.*)$/m.exec(end < 0 ? '' : text.slice(4, end));
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

/** { doc: [names], reason } for each "No change needed:" line in the body's "## Docs" section. */
export function docsOptOuts(body) {
  let text = String(body ?? '').replace(/^\uFEFF/, '');
  for (let prev = null; prev !== text;) { prev = text; text = text.replace(/<!--[\s\S]*?-->/g, ''); }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+docs\s*$/i.test(l.trim()));
  const out = [];
  if (start < 0) return out;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    const m = /^\s*[-*]?\s*no change needed:\s*(.+?):\s+(.+)$/i.exec(line);
    if (m) out.push({ docs: m[1].split(/[,\s]+/).filter(Boolean), reason: m[2].trim() });
  }
  return out;
}

/**
 * Everything wrong with a PR against the doc map. `entries` = [{ doc, code, exclude? }] (map entries plus wiki pages), `ignore` =
 * globs for docs that are history (never mapped), `files` = every tracked file, `changed` = the files the PR changes.
 */
export function docsProblems({ entries, ignore = [], files, changed, body }) {
  const problems = [];
  const fileSet = new Set(files);
  const optOuts = docsOptOuts(body);
  const touched = changed.filter(f => !NEVER_STALE.includes(f));

  for (const e of entries) {
    if (!fileSet.has(e.doc)) problems.push(`doc-map: ${e.doc} does not exist; fix or remove its entry.`);
    if (e.code.length === 0) problems.push(`${e.doc}: lists no code globs; map it in docs/doc-map.json or, for a wiki page, add a "covers:" line.`);
    for (const g of e.code) {
      if (!files.some(f => globToRegExp(g).test(f))) problems.push(`${e.doc}: glob "${g}" matches no file (the map is out of date); fix it in ${e.map ?? 'docs/doc-map.json'}.`);
    }
  }
  const mapped = new Set(entries.map(e => e.doc));
  for (const f of files) {
    if (/^(docs\/.*|content\/wiki\/[^/]*)\.md$/.test(f) && !mapped.has(f) && !matchesAny(ignore, f)) {
      problems.push(`${f} is not in docs/doc-map.json. Map it to the code it describes (or add it to "ignore" if it is history); a wiki page needs a "covers:" line.`);
    }
  }

  const stale = [];
  for (const e of entries) {
    if (changed.includes(e.doc)) continue;
    const hits = touched.filter(f => f !== e.doc && matchesAny(e.code, f) && !matchesAny(e.exclude ?? [], f));
    if (hits.length === 0) continue;
    const skip = optOuts.find(o => o.docs.some(d => d === 'all' || d === e.doc));
    if (skip && skip.reason.split(/\s+/).length >= MIN_REASON_WORDS) continue;
    stale.push({ doc: e.doc, hits, short: !!skip });
  }
  if (stale.length) {
    problems.push(
      'These docs describe code this PR changes but were not updated. Update each doc, or add a line to the "## Docs" section of the PR description ' +
      `(a reason of at least ${MIN_REASON_WORDS} words; "all" instead of a path skips every doc):`,
    );
    for (const s of stale) {
      const shown = s.hits.slice(0, 4).join(', ') + (s.hits.length > 4 ? `, +${s.hits.length - 4} more` : '');
      problems.push(`  ${s.doc} (changed: ${shown})${s.short ? ' [its "No change needed" reason is too short]' : ''}\n    No change needed: ${s.doc}: <why the doc is still accurate>`);
    }
  }
  return problems;
}

/** A PR that changes TCG Bridge (anything under bridge/ or obs-plugin/ except their READMEs, or streamdeck/) needs a "## TCG Bridge" section with at least one bullet: it becomes the app's What's new. */
export function bridgeNotesProblems({ changed, body }) {
  if (!changed.some(f => (f.startsWith('bridge/') && f !== 'bridge/README.md') || f.startsWith('streamdeck/') || (f.startsWith('obs-plugin/') && f !== 'obs-plugin/README.md'))) return [];
  let text = String(body ?? '').replace(/^﻿/, '');
  for (let prev = null; prev !== text;) { prev = text; text = text.replace(/<!--[\s\S]*?-->/g, ''); }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+TCG Bridge\s*$/i.test(l.trim()));
  const section = start < 0 ? [] : lines.slice(start + 1);
  const end = section.findIndex(l => /^#{1,6}\s/.test(l.trim()));
  if ((end < 0 ? section : section.slice(0, end)).some(l => /^[-*] +\S/.test(l.trim()))) return [];
  return ['This PR changes TCG Bridge (bridge/, streamdeck/ or obs-plugin/), so the PR description needs a "## TCG Bridge" section between "## Summary" and "## Docs" with at least one bullet written for the streamer: what changed in the app. It becomes the app\'s What\'s new for this version. Example:\n    ## TCG Bridge\n    - What\'s new now shows only what changed in the app, written for you.'];
}

/** The map file plus every wiki page's covers: line, ready for docsProblems. */
function load(files, read) {
  const map = JSON.parse(read('docs/doc-map.json'));
  const entries = map.docs.map(d => ({ ...d, map: 'docs/doc-map.json' }));
  for (const f of files) {
    if (/^content\/wiki\/[^/]*\.md$/.test(f)) entries.push({ doc: f, code: parseCovers(read(f)), map: f });
  }
  return { entries, ignore: map.ignore ?? [] };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { // not when the self-test imports this file
  let base;
  let body;
  if (process.env.GITHUB_EVENT_PATH) {
    const pr = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request ?? {};
    base = `origin/${pr.base?.ref ?? 'main'}`;
    body = pr.body;
  } else {
    base = process.argv[2] ?? 'origin/main';
    body = readFileSync(0, 'utf8');
  }
  const files = git('ls-files');
  const { entries, ignore } = load(files, f => readFileSync(f, 'utf8'));
  const changed = git('diff', '--name-only', `${base}...HEAD`);
  const problems = [...docsProblems({ entries, ignore, files, changed, body }), ...bridgeNotesProblems({ changed, body })];
  if (problems.length) {
    console.error('Docs check failed (see docs/git-and-prs.md):');
    for (const p of problems) console.error(p.startsWith(' ') ? p : '- ' + p);
    process.exit(1);
  }
  console.log('docs ok');
}
